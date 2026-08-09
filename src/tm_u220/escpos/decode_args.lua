local conditions = require("tm_u220.escpos.conditions")

local M = {}

local function failure(kind, message, next_cursor)
    return nil, { kind = kind, message = message, next_cursor = next_cursor }
end

local function read_byte(argument, data, cursor)
    local byte = string.byte(data, cursor)
    if byte == nil then
        return failure("truncated", "missing argument " .. argument.name, #data + 1)
    end
    return byte, cursor + 1
end

local function decode_u8(argument, data, cursor)
    local byte, next_value = read_byte(argument, data, cursor)
    if not byte then return nil, next_value end
    if byte < (argument.min or 0) or byte > (argument.max or 255) then
        return failure("invalid", argument.name .. " is outside its byte range", cursor + 1)
    end
    return byte, next_value
end

local function decode_enum(argument, data, cursor)
    local byte, next_value = read_byte(argument, data, cursor)
    if not byte then return nil, next_value end
    local decoded = argument.decode[byte]
    if decoded == nil then
        return failure("invalid", argument.name .. " has unsupported byte " .. byte, cursor + 1)
    end
    return decoded, next_value
end

local function decode_lsb_boolean(argument, data, cursor)
    local byte, next_value = read_byte(argument, data, cursor)
    if not byte then return nil, next_value end
    return (byte & 0x01) == 1, next_value
end

local function decode_bitfield(argument, data, cursor)
    local byte, next_value = read_byte(argument, data, cursor)
    if not byte then return nil, next_value end
    local decoded = { _reserved = byte & (argument.reserved_mask or 0) }
    for _, field in ipairs(argument.fields or {}) do
        decoded[field.name] = (byte & field.mask) ~= 0
    end
    return decoded, next_value
end

local function after_terminator(data, cursor, terminator)
    while cursor <= #data do
        if string.byte(data, cursor) == terminator then return cursor + 1 end
        cursor = cursor + 1
    end
    return #data + 1
end

local function decode_list(argument, data, cursor)
    local values = {}
    local previous
    while cursor <= #data do
        local byte = string.byte(data, cursor)
        cursor = cursor + 1
        if byte == argument.terminator then return values, cursor end
        if #values >= argument.max_count then
            return failure("invalid", argument.name .. " exceeds " .. argument.max_count .. " entries",
                after_terminator(data, cursor, argument.terminator))
        end
        if byte < argument.min or byte > argument.max then
            return failure("invalid", argument.name .. " contains an out-of-range byte",
                after_terminator(data, cursor, argument.terminator))
        end
        if argument.strictly_increasing and previous and byte <= previous then
            return failure("invalid", argument.name .. " must be strictly increasing",
                after_terminator(data, cursor, argument.terminator))
        end
        values[#values + 1] = byte
        previous = byte
    end
    return failure("truncated", "missing terminator for " .. argument.name, #data + 1)
end

local decoders = {
    u8 = decode_u8,
    enum = decode_enum,
    lsb_boolean = decode_lsb_boolean,
    bitfield = decode_bitfield,
    terminated_u8_list = decode_list,
}

function M.decode(command, data, cursor)
    local values = {}
    for _, argument in ipairs(command.args) do
        if conditions.applies(argument, values) then
            local decoder = decoders[argument.type]
            if not decoder then
                return nil, { kind = "invalid", message = "unsupported argument type " .. argument.type,
                    next_cursor = cursor }
            end
            local value, next_value = decoder(argument, data, cursor)
            if value == nil then return nil, next_value end
            values[argument.name] = value
            cursor = next_value
        end
    end
    return values, cursor
end

return M
