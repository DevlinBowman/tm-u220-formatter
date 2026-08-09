local bytes = require("tm_u220.core.bytes")
local diagnostics = require("tm_u220.core.diagnostics")
local encode_args = require("tm_u220.escpos.encode_args")
local registry = require("tm_u220.escpos.registry")

local M = {}

local function diagnostic(code, message, node_index)
    return diagnostics.new(code, message, { node_index = node_index })
end

local function encode_node(node, node_index)
    if type(node) ~= "table" then
        return nil, diagnostic("ENCODE_INVALID_NODE", "node must be a table", node_index)
    end
    if node.kind == "text" then
        if type(node.value) ~= "string" then
            return nil, diagnostic("ENCODE_INVALID_TEXT", "text node value must be a string", node_index)
        end
        return node.value
    end
    if node.kind ~= "command" then
        return nil, diagnostic("ENCODE_INVALID_NODE",
            "node kind must be text or command", node_index)
    end
    if type(node.id) ~= "string" then
        return nil, diagnostic("ENCODE_INVALID_COMMAND", "command id must be a string", node_index)
    end

    local command = registry.by_id[node.id]
    if not command then
        return nil, diagnostic("ENCODE_UNKNOWN_COMMAND", "unknown command id " .. node.id, node_index)
    end
    local encoded_args, err = encode_args.encode(command, node.args)
    if not encoded_args then
        return nil, diagnostic("ENCODE_INVALID_ARGUMENT", command.id .. ": " .. err, node_index)
    end
    return bytes.from_array(command.prefix) .. encoded_args
end

function M.encode(nodes)
    local found = {}
    local out = {}
    local parts = {}
    if type(nodes) ~= "table" then
        found[1] = diagnostic("ENCODE_INVALID_INPUT", "nodes must be an array", 0)
        return { bytes = nil, diagnostics = found }
    end

    local count = #nodes
    for key in pairs(nodes) do
        if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > count then
            found[#found + 1] = diagnostic("ENCODE_INVALID_INPUT", "nodes must be a dense array", 0)
            return { bytes = nil, diagnostics = found }
        end
    end

    for index, node in ipairs(nodes) do
        local encoded, err = encode_node(node, index)
        if encoded then
            out[#out + 1] = encoded
            parts[#parts + 1] = {
                node_index = index,
                node_kind = node.kind,
                command_id = node.kind == "command" and node.id or nil,
                bytes = encoded,
            }
        else
            found[#found + 1] = err
        end
    end
    if #found > 0 then return { bytes = nil, diagnostics = found } end

    local cursor = 1
    for _, part in ipairs(parts) do
        part.byte_first = cursor
        part.byte_last = cursor + #part.bytes - 1
        cursor = part.byte_last + 1
    end
    return {
        bytes = table.concat(out),
        parts = parts,
        diagnostics = found,
    }
end

return M
