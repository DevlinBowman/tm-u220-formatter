local Diagnostics = require("tm_u220.core.diagnostics")
local SpecProfile = require("tm_u220.spec.profile")

local M = {}

local HEADER = "!tm-u220 profile 1"
local FIELD_ORDER = { "variant", "paper", "dip2_1", "cutter" }
local KNOWN_FIELDS = {}
for _, field in ipairs(FIELD_ORDER) do KNOWN_FIELDS[field] = true end

local PAPER_VALUES = { ["76"] = 76, ["69.5"] = 69.5, ["57.5"] = 57.5 }
local PAPER_TEXT = { ["76mm"] = "76", ["69.5mm"] = "69.5", ["57.5mm"] = "57.5" }

local function line_span(line)
    return { start_line = line, end_line = line }
end

local function diagnostic(code, message, line)
    return Diagnostics.new(code, message, line and line_span(line) or {})
end

local function split_lines(source)
    local lines = {}
    local cursor = 1
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

local function find_header(result, lines)
    for number, line in ipairs(lines) do
        if not ignored(line) then
            if line ~= HEADER then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "PROFILE_FILE_HEADER_REQUIRED",
                    "first content line must be exactly " .. HEADER, number)
                return nil
            end
            return number
        end
    end
    result.diagnostics[#result.diagnostics + 1] = diagnostic(
        "PROFILE_FILE_HEADER_MISSING", "profile header is missing; expected " .. HEADER,
        #lines + 1)
end

local function decode_value(key, value)
    if key == "variant" then
        if value == "A" or value == "B" or value == "D" then return value end
        return nil, "variant must be A, B, or D"
    elseif key == "paper" then
        if PAPER_VALUES[value] then return PAPER_VALUES[value] end
        return nil, "paper must be 76, 69.5, or 57.5"
    elseif key == "dip2_1" then
        if value == "on" then return true end
        if value == "off" then return false end
        return nil, "dip2_1 must be on or off"
    elseif key == "cutter" then
        if value == "partial" or value == "full" or value == "none" then return value end
        return nil, "cutter must be partial, full, or none"
    end
end

local function parse_fields(result, lines, first)
    local values, seen = {}, {}
    for number = first, #lines do
        local line = lines[number]
        if not ignored(line) then
            if line == HEADER then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "PROFILE_FILE_HEADER_DUPLICATE", "profile header may appear only once", number)
            else
                local key, raw = line:match("^([%a_][%w_]*)=([^=]*)$")
                if not key then
                    result.diagnostics[#result.diagnostics + 1] = diagnostic(
                        "PROFILE_FILE_INVALID_SYNTAX", "expected a key=value field", number)
                elseif not KNOWN_FIELDS[key] then
                    result.diagnostics[#result.diagnostics + 1] = diagnostic(
                        "PROFILE_FILE_UNKNOWN_FIELD", "unknown profile field " .. key, number)
                elseif seen[key] then
                    result.diagnostics[#result.diagnostics + 1] = diagnostic(
                        "PROFILE_FILE_DUPLICATE_FIELD", "duplicate profile field " .. key, number)
                else
                    seen[key] = number
                    local value, err = decode_value(key, raw)
                    if err then
                        result.diagnostics[#result.diagnostics + 1] = diagnostic(
                            "PROFILE_FILE_INVALID_FIELD", err, number)
                    else
                        values[key] = value
                    end
                end
            end
        end
    end
    for _, key in ipairs(FIELD_ORDER) do
        if not seen[key] then
            result.diagnostics[#result.diagnostics + 1] = diagnostic(
                "PROFILE_FILE_MISSING_FIELD", "missing required profile field " .. key,
                #lines + 1)
        end
    end
    return values
end

function M.parse(source)
    local result = { options = nil, diagnostics = {} }
    if type(source) ~= "string" then
        result.diagnostics[1] = diagnostic(
            "PROFILE_FILE_INVALID_INPUT", "profile source must be a string", 1)
        return result
    end

    local lines = split_lines(source)
    local header_line = find_header(result, lines)
    if not header_line then return result end
    local options = parse_fields(result, lines, header_line + 1)
    if #result.diagnostics > 0 then return result end

    local _, err = SpecProfile.new(options)
    if err then
        result.diagnostics[1] = diagnostic(
            "PROFILE_FILE_INVALID_PROFILE", err, header_line)
        return result
    end
    result.options = options
    return result
end

function M.serialize(options)
    if type(options) ~= "table" then
        return nil, diagnostic("PROFILE_FILE_INVALID_INPUT", "profile options must be a table")
    end
    for _, key in ipairs(FIELD_ORDER) do
        if options[key] == nil then
            return nil, diagnostic("PROFILE_FILE_MISSING_FIELD",
                "missing required profile field " .. key)
        end
    end
    local profile, err = SpecProfile.new(options)
    if not profile then
        return nil, diagnostic("PROFILE_FILE_INVALID_PROFILE", err)
    end
    local paper = assert(PAPER_TEXT[profile.paper_id])
    return table.concat({ HEADER, "variant=" .. profile.variant:upper(),
        "paper=" .. paper, "dip2_1=" .. (profile.dip2_1 and "on" or "off"),
        "cutter=" .. profile.cutter, "" }, "\n")
end

return M
