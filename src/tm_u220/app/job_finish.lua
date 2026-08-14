-- Executes the reusable feed, installed-cut, and reset shorthand wherever it appears.
-- Terminal summary metadata remains limited to a final cut-shaped operation.
local commands = require("tm_u220.app.job_commands")

local M = {}

function M.handle(context, operation)
    if not context:require_beginning("@fi", operation.span) then return end
    context:print_motion(
        "print.feed_lines",
        { lines = operation.feed_lines },
        "finish",
        operation.span
    )
    commands.handle(context, {
        kind = "cut",
        mode = "installed",
        span = operation.span,
    })
    commands.handle(context, {
        kind = "init",
        span = operation.span,
    })
end

function M.describe(operations, profile)
    local final = operations and operations[#operations]
    if not final or (final.kind ~= "cut" and final.kind ~= "finish") then return nil end
    return {
        advance_to_cut_position = true,
        cut_shape = profile.cutter,
        feed_lines = final.kind == "finish" and final.feed_lines or 0,
        feed_units = final.kind == "cut" and (final.feed or 0) or 0,
    }
end

return M
