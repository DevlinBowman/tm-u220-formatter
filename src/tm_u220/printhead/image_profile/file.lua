-- Parses and serializes the exact versioned file format for image-interpretation profiles.
-- It performs no path lookup or I/O, leaving configuration ownership outside the printhead domain.
local Diagnostics = require("tm_u220.core.diagnostics")
local Model = require("tm_u220.printhead.image_profile.model")

local M = {}

local HEADER = "!tm-u220 image-profile " .. Model.VERSION
local FIELD_ORDER = Model.fields()
local KNOWN_FIELDS = {}
for _, field in ipairs(FIELD_ORDER) do KNOWN_FIELDS[field] = true end

local VALUES = {
    density = { solid = true, detail = true },
    fit = { contain = true, cover = true, stretch = true },
    resample = { nearest = true, area = true, bilinear = true },
    dither = { threshold = true, ordered = true, floyd = true },
}
local VALUE_TEXT = {
    density = "solid or detail",
    fit = "contain, cover, or stretch",
    resample = "nearest, area, or bilinear",
    dither = "threshold, ordered, or floyd",
}

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

local function decode_value(field, raw)
    if VALUES[field] then
        if VALUES[field][raw] then return raw end
        return nil, field .. " must be " .. VALUE_TEXT[field]
    end
    if field == "invert" or field == "unidirectional" then
        if raw == "on" then return true end
        if raw == "off" then return false end
        return nil, field .. " must be on or off"
    end
    if field == "threshold" then
        local value = integer(raw, 0, 255)
        return value, value == nil and "threshold must be an integer from 0 through 255" or nil
    end
    if field == "trailing_gap_vertical_units" then
        local value = integer(raw, 0, 255)
        return value, value == nil
            and "trailing_gap_vertical_units must be an integer from 0 through 255" or nil
    end
    if field == "default_width_cells" then
        if raw == "page" then return raw end
        local value = integer(raw, 1, math.maxinteger)
        return value, value == nil and "default_width_cells must be a positive integer or page" or nil
    end
    if field == "default_height_cells" then
        if raw == "auto" then return raw end
        local value = integer(raw, 1, math.maxinteger)
        return value, value == nil and "default_height_cells must be a positive integer or auto" or nil
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
            elseif not KNOWN_FIELDS[field] then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "IMAGE_PROFILE_FILE_UNKNOWN_FIELD", "unknown image profile field " .. field, number)
            elseif seen[field] then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "IMAGE_PROFILE_FILE_DUPLICATE_FIELD", "duplicate image profile field " .. field, number)
            else
                seen[field] = true
                local value, err = decode_value(field, raw)
                if err then
                    result.diagnostics[#result.diagnostics + 1] = diagnostic(
                        "IMAGE_PROFILE_FILE_INVALID_FIELD", err, number)
                else
                    options[field] = value
                end
            end
        end
    end
    for _, field in ipairs(FIELD_ORDER) do
        if not seen[field] then
            result.diagnostics[#result.diagnostics + 1] = diagnostic(
                "IMAGE_PROFILE_FILE_MISSING_FIELD", "missing required image profile field " .. field,
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
    if field == "invert" or field == "unidirectional" then
        return value and "on" or "off"
    end
    return tostring(value)
end

function M.serialize(value)
    if type(value) ~= "table" then
        return nil, diagnostic("IMAGE_PROFILE_FILE_INVALID_INPUT", "image profile must be a table")
    end
    local profile, err = Model.new(value)
    if not profile then
        return nil, diagnostic("IMAGE_PROFILE_FILE_INVALID_PROFILE", err)
    end
    local lines = { HEADER }
    for _, field in ipairs(FIELD_ORDER) do
        lines[#lines + 1] = field .. "=" .. encode_value(field, profile[field])
    end
    lines[#lines + 1] = ""
    return table.concat(lines, "\n")
end

M.HEADER = HEADER

return M
