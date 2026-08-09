-- Implements line-level rule and key/value layout using printer cells instead of UTF-8 byte counts.
-- Text validation and slicing stay delegated to the formatter context's Unicode pipeline.
local state_api = require("tm_u220.format.state")

local M = {}

function M.rule(context, operation)
    if not context:require_beginning("@rule", operation.span) then return end
    local pattern_cells = context:text_cells(operation.pattern, operation.span)
    if not pattern_cells then return end
    if pattern_cells < 1 then
        context:add_diagnostic(
            "FORMAT_RULE_CHARACTER",
            "@rule requires one or more printable Unicode glyphs",
            operation.span
        )
        return
    end
    local capacity = state_api.capacity(context.state)
    if capacity < 1 then
        context:add_diagnostic(
            "FORMAT_CHARACTER_TOO_WIDE",
            "current font and spacing cannot fit any rule glyph on the selected paper",
            operation.span
        )
        return
    end
    local repetitions = math.floor(capacity / pattern_cells)
    local remainder = capacity % pattern_cells
    local suffix = context:text_slice(operation.pattern, 1, remainder)
    context:text(operation.pattern:rep(repetitions) .. suffix, operation.span)
    context:line_feed("rule")
end

function M.key_value(context, operation)
    if not context:require_beginning("@kv", operation.span) then return end
    local left_cells = context:text_cells(operation.left, operation.span)
    local right_cells = context:text_cells(operation.right, operation.span)
    if not left_cells or not right_cells then return end

    local capacity = state_api.capacity(context.state)
    if right_cells > capacity then
        context:add_diagnostic(
            "FORMAT_VALUE_TOO_WIDE",
            "@kv right value exceeds the current line capacity",
            operation.span
        )
        return
    end

    local left = operation.left
    local available = math.max(0, capacity - right_cells - 1)
    while left_cells > available do
        local count = math.min(capacity, left_cells)
        context:text(context:text_slice(left, 1, count), operation.span)
        context:line_feed("key_value_wrap")
        left = context:text_slice(left, count + 1, left_cells - count)
        left_cells = left_cells - count
    end

    local padding = capacity - left_cells - right_cells
    if left ~= "" then context:text(left, operation.span) end
    if padding > 0 then context:text((" "):rep(padding), operation.span) end
    context:text(operation.right, operation.span)
    context:line_feed("key_value")
end

return M
