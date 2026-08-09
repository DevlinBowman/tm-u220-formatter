local diagnostics = require("tm_u220.core.diagnostics")
local decode_args = require("tm_u220.escpos.decode_args")
local registry = require("tm_u220.escpos.registry")

local M = {}

local function span(first, last)
    return { first = first, last = last }
end

local function add_diagnostic(result, code, message, first, last)
    result.diagnostics[#result.diagnostics + 1] =
        diagnostics.new(code, message, span(first, last))
end

local function add_unknown(result, data, first, next_cursor, command_id, reason)
    local last = math.max(first, next_cursor - 1)
    result.nodes[#result.nodes + 1] = {
        kind = "unknown",
        command_id = command_id,
        reason = reason,
        raw = data:sub(first, last),
        span = span(first, last),
    }
end

local function is_control(byte)
    return byte < 0x20 or byte == 0x7F
end

local function parse_command(result, data, start_index, command, prefix_length)
    local args, next_value = decode_args.decode(command, data, start_index + prefix_length)
    if args then
        local last = next_value - 1
        result.nodes[#result.nodes + 1] = {
            kind = "command",
            id = command.id,
            args = args,
            raw = data:sub(start_index, last),
            span = span(start_index, last),
        }
        return next_value
    end

    local failure = next_value
    local next_cursor = math.max(start_index + prefix_length, failure.next_cursor or (#data + 1))
    local last = math.min(#data, math.max(start_index, next_cursor - 1))
    local code = failure.kind == "truncated"
        and "ESCPOS_TRUNCATED_COMMAND" or "ESCPOS_INVALID_ARGUMENT"
    add_diagnostic(result, code, command.id .. ": " .. failure.message, start_index, last)
    add_unknown(result, data, start_index, last + 1, command.id, failure.kind)
    return last + 1
end

local function parse_text(result, data, start_index)
    local cursor = start_index
    while cursor <= #data and not is_control(string.byte(data, cursor)) do
        cursor = cursor + 1
    end
    local last = cursor - 1
    local value = data:sub(start_index, last)
    result.nodes[#result.nodes + 1] = {
        kind = "text",
        value = value,
        raw = value,
        span = span(start_index, last),
    }
    return cursor
end

function M.parse(data)
    local result = { nodes = {}, diagnostics = {} }
    if type(data) ~= "string" then
        add_diagnostic(result, "ESCPOS_INVALID_INPUT", "input must be a byte string", 0, 0)
        return result
    end

    local cursor = 1
    while cursor <= #data do
        local command, prefix_length = registry.match(data, cursor)
        if command then
            cursor = parse_command(result, data, cursor, command, prefix_length)
        elseif registry.remaining_is_prefix(data, cursor) then
            add_diagnostic(result, "ESCPOS_TRUNCATED_COMMAND",
                "input ends inside a command prefix", cursor, #data)
            add_unknown(result, data, cursor, #data + 1, nil, "truncated")
            cursor = #data + 1
        else
            local byte = string.byte(data, cursor)
            if is_control(byte) then
                add_diagnostic(result, "ESCPOS_UNKNOWN_CONTROL",
                    string.format("unknown control byte 0x%02X", byte), cursor, cursor)
                add_unknown(result, data, cursor, cursor + 1, nil, "unknown_control")
                cursor = cursor + 1
            else
                cursor = parse_text(result, data, cursor)
            end
        end
    end
    return result
end

return M
