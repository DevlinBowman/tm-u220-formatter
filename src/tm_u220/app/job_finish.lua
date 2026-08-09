local diagnostics = require("tm_u220.core.diagnostics")
local commands = require("tm_u220.app.job_commands")

local M = {}

local function issue(code, message, operation)
    return diagnostics.new(code, message, operation and operation.span)
end

function M.validate(operations)
    local markers = {}
    for index, operation in ipairs(operations or {}) do
        if operation.kind == "finish" then
            markers[#markers + 1] = index
        end
    end

    if #markers == 0 then return {} end

    local found = {}
    for index = 2, #markers do
        local operation = operations[markers[index]]
        found[#found + 1] = issue(
            "FORMAT_FINISH_DUPLICATE",
            "@fi may appear only once",
            operation
        )
    end

    local marker_index = markers[1]
    if marker_index ~= #operations then
        found[#found + 1] = issue(
            "FORMAT_FINISH_NOT_FINAL",
            "@fi must be the final job operation",
            operations[marker_index]
        )
    end

    return found
end

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
