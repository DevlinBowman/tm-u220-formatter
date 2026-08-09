-- Encodes deterministic JSON while accepting both authored UTF-8 and raw byte strings.
local JsonString = require("tm_u220.core.json_string")

local M = {}

local function is_array(value)
    local count = 0
    for key in pairs(value) do
        if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then
            return false
        end
        count = math.max(count, key)
    end
    for index = 1, count do
        if value[index] == nil then return false end
    end
    return true, count
end

local function encode(value, seen)
    local kind = type(value)
    if kind == "nil" then return "null" end
    if kind == "boolean" or kind == "number" then return tostring(value) end
    if kind == "string" then return '"' .. JsonString.escape(value) .. '"' end
    if kind ~= "table" then error("cannot encode JSON value of type " .. kind) end
    if seen[value] then error("cannot encode cyclic table") end
    seen[value] = true

    local array, count = is_array(value)
    local out = {}
    if array then
        for index = 1, count do out[index] = encode(value[index], seen) end
        seen[value] = nil
        return "[" .. table.concat(out, ",") .. "]"
    end

    local keys = {}
    for key in pairs(value) do
        assert(type(key) == "string", "JSON object keys must be strings")
        keys[#keys + 1] = key
    end
    table.sort(keys)
    for index, key in ipairs(keys) do
        out[index] = '"' .. JsonString.escape(key) .. '":' .. encode(value[key], seen)
    end
    seen[value] = nil
    return "{" .. table.concat(out, ",") .. "}"
end

function M.encode(value)
    return encode(value, {})
end

return M
