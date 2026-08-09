-- Escapes Lua byte strings into JSON string contents without corrupting valid UTF-8.
-- Malformed bytes are represented individually as ASCII-only Unicode escapes.
local M = {}

local SIMPLE_ESCAPES = {
    [0x08] = "\\b",
    [0x09] = "\\t",
    [0x0A] = "\\n",
    [0x0C] = "\\f",
    [0x0D] = "\\r",
    [0x22] = '\\"',
    [0x5C] = "\\\\",
}

local function continuation(byte)
    return byte and byte >= 0x80 and byte <= 0xBF
end

local function utf8_length(value, index, first)
    local second = value:byte(index + 1)
    if first >= 0xC2 and first <= 0xDF then
        return continuation(second) and 2 or nil
    end

    local third = value:byte(index + 2)
    if first >= 0xE0 and first <= 0xEF then
        local second_ok = continuation(second)
            and (first ~= 0xE0 or second >= 0xA0)
            and (first ~= 0xED or second <= 0x9F)
        return second_ok and continuation(third) and 3 or nil
    end

    local fourth = value:byte(index + 3)
    if first >= 0xF0 and first <= 0xF4 then
        local second_ok = continuation(second)
            and (first ~= 0xF0 or second >= 0x90)
            and (first ~= 0xF4 or second <= 0x8F)
        return second_ok and continuation(third) and continuation(fourth)
            and 4 or nil
    end
end

function M.escape(value)
    local out, index = {}, 1
    while index <= #value do
        local byte = value:byte(index)
        local escaped = SIMPLE_ESCAPES[byte]
        if escaped then
            out[#out + 1] = escaped
            index = index + 1
        elseif byte < 0x20 then
            out[#out + 1] = string.format("\\u%04X", byte)
            index = index + 1
        elseif byte < 0x80 then
            out[#out + 1] = string.char(byte)
            index = index + 1
        else
            local length = utf8_length(value, index, byte)
            if length then
                out[#out + 1] = value:sub(index, index + length - 1)
                index = index + length
            else
                out[#out + 1] = string.format("\\u00%02X", byte)
                index = index + 1
            end
        end
    end
    return table.concat(out)
end

return M
