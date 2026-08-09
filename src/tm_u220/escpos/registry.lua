local spec = require("tm_u220.spec.index")

local root = { children = {} }

for _, command in ipairs(spec.commands) do
    local node = root
    for _, byte in ipairs(command.prefix) do
        local child = node.children[byte]
        if not child then
            child = { children = {} }
            node.children[byte] = child
        end
        node = child
    end
    node.command = command
end

local M = { by_id = spec.by_id }

function M.match(data, start_index)
    local node = root
    local best
    local best_length = 0
    local cursor = start_index

    while cursor <= #data do
        node = node.children[string.byte(data, cursor)]
        if not node then break end
        if node.command then
            best = node.command
            best_length = cursor - start_index + 1
        end
        cursor = cursor + 1
    end

    return best, best_length
end

function M.remaining_is_prefix(data, start_index)
    local node = root
    for cursor = start_index, #data do
        node = node.children[string.byte(data, cursor)]
        if not node then return false end
    end
    return next(node.children) ~= nil
end

return M
