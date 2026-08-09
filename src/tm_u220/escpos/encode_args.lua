local bytes = require("tm_u220.core.bytes")
local conditions = require("tm_u220.escpos.conditions")

local M = {}

local function integer_in_range(value, minimum, maximum)
    return type(value) == "number" and value % 1 == 0
        and value >= minimum and value <= maximum
end

local function encode_u8(argument, value)
    if not integer_in_range(value, argument.min or 0, argument.max or 255) then
        return nil, argument.name .. " must be an integer in range "
            .. (argument.min or 0) .. ".." .. (argument.max or 255)
    end
    return string.char(value)
end

local function encode_enum(argument, value)
    local byte = argument.encode[value]
    if byte == nil then
        return nil, argument.name .. " has an unsupported enum value"
    end
    return string.char(byte)
end

local function encode_lsb_boolean(argument, value)
    if type(value) ~= "boolean" then
        return nil, argument.name .. " must be boolean"
    end
    return string.char(value and 1 or 0)
end

local function encode_bitfield(argument, value)
    if type(value) ~= "table" then
        return nil, argument.name .. " must be a bitfield table"
    end

    local allowed = { _reserved = true }
    local byte = value._reserved or 0
    local reserved_mask = argument.reserved_mask or 0
    if not integer_in_range(byte, 0, 255) or (byte & ~reserved_mask) ~= 0 then
        return nil, argument.name .. "._reserved contains a non-reserved bit"
    end

    for _, field in ipairs(argument.fields or {}) do
        allowed[field.name] = true
        local enabled = value[field.name]
        if enabled ~= nil and type(enabled) ~= "boolean" then
            return nil, argument.name .. "." .. field.name .. " must be boolean"
        end
        if enabled then byte = byte | field.mask end
    end
    for key in pairs(value) do
        if not allowed[key] then
            return nil, argument.name .. " has unknown field " .. tostring(key)
        end
    end
    return string.char(byte)
end

local function encode_list(argument, value)
    if type(value) ~= "table" then
        return nil, argument.name .. " must be an array of bytes"
    end
    local count = #value
    for key in pairs(value) do
        if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > count then
            return nil, argument.name .. " must be a dense array"
        end
    end
    if count > argument.max_count then
        return nil, argument.name .. " exceeds " .. argument.max_count .. " entries"
    end

    local previous
    for index, item in ipairs(value) do
        if not integer_in_range(item, argument.min, argument.max) then
            return nil, argument.name .. "[" .. index .. "] is outside its byte range"
        end
        if argument.strictly_increasing and previous and item <= previous then
            return nil, argument.name .. " must be strictly increasing"
        end
        previous = item
    end
    return bytes.from_array(value) .. string.char(argument.terminator)
end

local encoders = {
    u8 = encode_u8,
    enum = encode_enum,
    lsb_boolean = encode_lsb_boolean,
    bitfield = encode_bitfield,
    terminated_u8_list = encode_list,
}

function M.encode(command, values)
    values = values or {}
    if type(values) ~= "table" then return nil, "args must be a table" end

    local known = {}
    local out = {}
    for _, argument in ipairs(command.args) do
        known[argument.name] = true
        local applies = conditions.applies(argument, values)
        local value = values[argument.name]
        if applies and value == nil then
            return nil, "missing required argument " .. argument.name
        elseif not applies and value ~= nil then
            return nil, argument.name .. " is not valid for the selected mode"
        elseif applies then
            local encoder = encoders[argument.type]
            if not encoder then return nil, "unsupported argument type " .. argument.type end
            local encoded, err = encoder(argument, value)
            if not encoded then return nil, err end
            out[#out + 1] = encoded
        end
    end
    for key in pairs(values) do
        if not known[key] then return nil, "unknown argument " .. tostring(key) end
    end
    return table.concat(out)
end

return M
