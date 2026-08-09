local M = {}

function M.applies(argument, values)
    local condition = argument.when
    if not condition then return true end

    local actual = values[condition.arg]
    for _, expected in ipairs(condition.one_of or {}) do
        if actual == expected then return true end
    end
    return false
end

return M
