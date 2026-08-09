-- Strictly separates UTF-8 text into scalar records for the charset encoder.
-- It rejects malformed, overlong, surrogate, and out-of-range sequences at their starting byte.
local M = {}

local function continuation(byte)
    return byte and byte >= 0x80 and byte <= 0xBF
end

local function failure(index)
    return nil, {
        code = "CHARSET_INVALID_UTF8",
        message = "text contains invalid UTF-8 at byte " .. index,
        byte_index = index,
    }
end

function M.decode(value)
    if type(value) ~= "string" then
        return nil, {
            code = "CHARSET_INVALID_INPUT",
            message = "charset text must be a string",
        }
    end

    local scalars, index = {}, 1
    while index <= #value do
        local first = value:byte(index)
        local length, codepoint
        if first <= 0x7F then
            length, codepoint = 1, first
        elseif first >= 0xC2 and first <= 0xDF then
            local second = value:byte(index + 1)
            if not continuation(second) then return failure(index) end
            length = 2
            codepoint = (first - 0xC0) * 0x40 + (second - 0x80)
        elseif first >= 0xE0 and first <= 0xEF then
            local second, third = value:byte(index + 1, index + 2)
            local second_ok = continuation(second)
                and (first ~= 0xE0 or second >= 0xA0)
                and (first ~= 0xED or second <= 0x9F)
            if not second_ok or not continuation(third) then return failure(index) end
            length = 3
            codepoint = (first - 0xE0) * 0x1000
                + (second - 0x80) * 0x40 + (third - 0x80)
        elseif first >= 0xF0 and first <= 0xF4 then
            local second, third, fourth = value:byte(index + 1, index + 3)
            local second_ok = continuation(second)
                and (first ~= 0xF0 or second >= 0x90)
                and (first ~= 0xF4 or second <= 0x8F)
            if not second_ok or not continuation(third)
                or not continuation(fourth) then
                return failure(index)
            end
            length = 4
            codepoint = (first - 0xF0) * 0x40000
                + (second - 0x80) * 0x1000
                + (third - 0x80) * 0x40 + (fourth - 0x80)
        else
            return failure(index)
        end

        scalars[#scalars + 1] = {
            char = value:sub(index, index + length - 1),
            codepoint = codepoint,
            byte_index = index,
        }
        index = index + length
    end
    return scalars
end

function M.length(value)
    local scalars, failure = M.decode(value)
    if not scalars then return nil, failure end
    return #scalars
end

function M.slice(value, first, count)
    local scalars, failure = M.decode(value)
    if not scalars then return nil, failure end
    first = math.max(1, first or 1)
    count = math.max(0, count or (#scalars - first + 1))
    local out = {}
    local last = math.min(#scalars, first + count - 1)
    for index = first, last do out[#out + 1] = scalars[index].char end
    return table.concat(out)
end

return M
