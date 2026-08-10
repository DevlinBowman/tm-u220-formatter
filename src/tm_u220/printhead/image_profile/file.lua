-- Parses and serializes the exact schema-owned image-profile file format.
-- It performs no path lookup or I/O, leaving configuration ownership outside the printhead domain.
local Diagnostics = require("tm_u220.core.diagnostics")
local Model = require("tm_u220.printhead.image_profile.model")
local Schema = require("tm_u220.printhead.image_profile.schema")

local M = {}

local HEADER = Schema.HEADER
local FIELDS = Schema.fields()
local BY_NAME = {}
for _, field in ipairs(FIELDS) do
    BY_NAME[field.name] = field
    if field.choices then
        field.accepted = {}
        for _, choice in ipairs(field.choices) do field.accepted[choice] = true end
    end
end

local function line_span(line)
    return { start_line = line, end_line = line }
end

local function diagnostic(code, message, line)
    return Diagnostics.new(code, message, line and line_span(line) or {})
end

local function split_lines(source)
    local lines, cursor = {}, 1
    while true do
        local newline = source:find("\n", cursor, true)
        if not newline then
            if cursor <= #source or #source == 0 then
                lines[#lines + 1] = source:sub(cursor):gsub("\r$", "")
            end
            return lines
        end
        lines[#lines + 1] = source:sub(cursor, newline - 1):gsub("\r$", "")
        cursor = newline + 1
        if cursor > #source then return lines end
    end
end

local function ignored(line)
    return line:match("^%s*$") ~= nil or line:match("^%s*#") ~= nil
end

local function integer(raw, minimum, maximum)
    if not raw:match("^%d+$") then return nil end
    local value = tonumber(raw)
    if not value or value < minimum or value > maximum or tostring(value) ~= raw then return nil end
    return value
end

local function choice_text(choices)
    if #choices == 2 then return choices[1] .. " or " .. choices[2] end
    return table.concat(choices, ", ", 1, #choices - 1)
        .. ", or " .. choices[#choices]
end

local function decode_value(field, raw)
    if field.kind == "enum" then
        if field.accepted[raw] then return raw end
        return nil, field.name .. " must be " .. choice_text(field.choices)
    end
    if field.kind == "boolean" then
        if raw == "on" then return true end
        if raw == "off" then return false end
        return nil, field.name .. " must be on or off"
    end
    if field.kind == "integer" then
        local value = integer(raw, field.minimum, field.maximum)
        return value, value == nil and string.format(
            "%s must be an integer from %d through %d",
            field.name, field.minimum, field.maximum) or nil
    end
    if field.kind == "integer_or_keyword" then
        if raw == field.keyword then return raw end
        local value = integer(raw, field.minimum, field.maximum or math.maxinteger)
        local range = field.maximum and string.format(
            "an integer from %d through %d", field.minimum, field.maximum)
            or "a positive integer"
        return value, value == nil and field.name
            .. " must be " .. range .. " or " .. field.keyword or nil
    end
end

local function find_header(result, lines)
    for number, line in ipairs(lines) do
        if not ignored(line) then
            if line ~= HEADER then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "IMAGE_PROFILE_FILE_HEADER_REQUIRED",
                    "first content line must be exactly " .. HEADER, number)
                return nil
            end
            return number
        end
    end
    result.diagnostics[#result.diagnostics + 1] = diagnostic(
        "IMAGE_PROFILE_FILE_HEADER_MISSING",
        "image profile header is missing; expected " .. HEADER, #lines + 1)
end

local function parse_fields(result, lines, first)
    local options, seen = {}, {}
    for number = first, #lines do
        local line = lines[number]
        if not ignored(line) then
            local field, raw = line:match("^([%a_][%w_]*)=([^=]*)$")
            if line == HEADER then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "IMAGE_PROFILE_FILE_HEADER_DUPLICATE", "image profile header may appear only once", number)
            elseif not field then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "IMAGE_PROFILE_FILE_INVALID_SYNTAX", "expected a key=value field", number)
            elseif not BY_NAME[field] then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "IMAGE_PROFILE_FILE_UNKNOWN_FIELD", "unknown image profile field " .. field, number)
            elseif seen[field] then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "IMAGE_PROFILE_FILE_DUPLICATE_FIELD", "duplicate image profile field " .. field, number)
            else
                seen[field] = true
                local value, err = decode_value(BY_NAME[field], raw)
                if err then
                    result.diagnostics[#result.diagnostics + 1] = diagnostic(
                        "IMAGE_PROFILE_FILE_INVALID_FIELD", err, number)
                else
                    options[field] = value
                end
            end
        end
    end
    for _, field in ipairs(FIELDS) do
        if not seen[field.name] then
            result.diagnostics[#result.diagnostics + 1] = diagnostic(
                "IMAGE_PROFILE_FILE_MISSING_FIELD",
                "missing required image profile field " .. field.name,
                #lines + 1)
        end
    end
    return options
end

function M.parse(source)
    local result = { profile = nil, diagnostics = {} }
    if type(source) ~= "string" then
        result.diagnostics[1] = diagnostic(
            "IMAGE_PROFILE_FILE_INVALID_INPUT", "image profile source must be a string", 1)
        return result
    end
    local lines = split_lines(source)
    local header_line = find_header(result, lines)
    if not header_line then return result end
    local options = parse_fields(result, lines, header_line + 1)
    if #result.diagnostics > 0 then return result end
    local profile, err = Model.new(options)
    if not profile then
        result.diagnostics[1] = diagnostic(
            "IMAGE_PROFILE_FILE_INVALID_PROFILE", err, header_line)
        return result
    end
    result.profile = profile
    return result
end

local function encode_value(field, value)
    if field.kind == "boolean" then
        return value and "on" or "off"
    end
    return tostring(value)
end

function M.serialize(value)
    if type(value) ~= "table" then
        return nil, diagnostic("IMAGE_PROFILE_FILE_INVALID_INPUT", "image profile must be a table")
    end
    local options = value
    if Model.is(value) then options = assert(Model.options(value)) end
    local profile, err = Model.new(options)
    if not profile then
        return nil, diagnostic("IMAGE_PROFILE_FILE_INVALID_PROFILE", err)
    end
    local lines = { HEADER }
    for _, field in ipairs(FIELDS) do
        lines[#lines + 1] = field.name .. "="
            .. encode_value(field, profile[field.name])
    end
    lines[#lines + 1] = ""
    return table.concat(lines, "\n")
end

M.HEADER = HEADER

return M
