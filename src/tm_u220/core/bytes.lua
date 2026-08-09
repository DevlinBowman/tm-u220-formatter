local M = {}

function M.from_array(values)
    local out = {}
    for index, value in ipairs(values) do
        assert(type(value) == "number" and value >= 0 and value <= 255,
            "byte out of range at index " .. index)
        out[index] = string.char(value)
    end
    return table.concat(out)
end

function M.to_array(value)
    local out = {}
    for index = 1, #value do
        out[index] = string.byte(value, index)
    end
    return out
end

function M.to_hex(value)
    local out = {}
    for index = 1, #value do
        out[index] = string.format("%02X", string.byte(value, index))
    end
    return table.concat(out, " ")
end

function M.from_hex(value)
    local compact = value:gsub("#.-\n", " "):gsub("0[xX]", ""):gsub("[%s,_:-]", "")
    if compact == "" then
        return ""
    end
    if compact:find("[^%x]") then
        return nil, "hex input contains a non-hexadecimal character"
    end
    if #compact % 2 ~= 0 then
        return nil, "hex input must contain complete byte pairs"
    end

    local out = {}
    for index = 1, #compact, 2 do
        out[#out + 1] = string.char(tonumber(compact:sub(index, index + 1), 16))
    end
    return table.concat(out)
end

function M.slice(value, first, count)
    return value:sub(first, first + count - 1)
end

return M
