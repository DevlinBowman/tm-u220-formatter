-- Parses the formatter-defined terminal finish shorthand into its normalized operation.
-- Recognition metadata also lets reference and configuration checks share canonical names.
local Syntax = require("tm_u220.job.directive.syntax")

local M = {}
local FINISH_LINES = 4
local names = { fi = true }

function M.recognizes(name)
    return names[name] == true
end

M.names = names

local function issue()
    return {
        code = "job.directive.invalid_arguments",
        message = "@fi expects no arguments",
    }
end

function M.parse(name, arguments, span)
    if not M.recognizes(name) then return nil, nil, false end
    local value = Syntax.trim(arguments)
    if value ~= nil and value ~= "" then return nil, issue(), true end
    return {
        kind = "finish",
        feed_lines = FINISH_LINES,
        span = span,
    }, nil, true
end

return M
