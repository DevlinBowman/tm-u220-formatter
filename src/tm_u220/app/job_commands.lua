-- Compiles scalar job operations into formatter-context state changes and ESC/POS commands.
-- Hardware- and placement-sensitive operations are validated here before emission.
local state_api = require("tm_u220.format.state")

local M = {}

local function print_mode(context)
    local state = context.state
    context:command("style.print_mode", {
        mode = {
            font_b = state.font == "b",
            emphasized = state.emphasis,
            double_height = state.double_height,
            double_width = state.double_width,
            underline = state.underline ~= "off",
        },
    })
    if state.underline == "double" then
        context:command("style.underline", { mode = "double" })
    end
end

local function set_beginning_value(context, operation, field, command, argument)
    if not context:require_beginning("@" .. operation.kind, operation.span) then return end
    context.state[field] = operation.value
    if field == "justification" then
        context.line_justification = operation.value
    end
    context:command(command, { [argument] = operation.value })
end

local function set_beginning_toggle(context, operation, field, command)
    local label = "@" .. operation.kind:gsub("_", "-")
    if not context:require_beginning(label, operation.span) then return end
    context.state[field] = operation.enabled
    context:command(command, { enabled = operation.enabled })
end

local function handle_cut(context, operation)
    if not context:require_beginning("@cut", operation.span) then return end
    local installed = context.profile.cutter
    if not context.profile.autocutter or installed == "none" then
        context:add_diagnostic(
            "FORMAT_CUTTER_UNAVAILABLE",
            "the selected printer profile has no autocutter",
            operation.span
        )
        return
    end
    if operation.mode ~= "installed" and operation.mode ~= installed then
        context:add_diagnostic(
            "FORMAT_CUT_SHAPE_MISMATCH",
            "the printer's cut shape is " .. installed
                .. "; ESC/POS cannot switch it to " .. operation.mode,
            operation.span
        )
        return
    end

    local partial = installed == "partial"
    context:cut({
        mode = partial and "function_b_66" or "function_b_65",
        feed_units = operation.feed or 0,
    }, installed, operation.span)
end

function M.handle(context, operation)
    local kind = operation.kind
    if kind == "init" then
        if context:require_beginning("@init", operation.span) then
            context:command("control.initialize")
            context:reset()
        end
    elseif kind == "line" then
        context:line_feed("explicit", operation.span)
    elseif kind == "tab" then
        context:horizontal_tab(operation.span)
    elseif kind == "code_page" then
        context:lock_code_table(operation.value, operation.span)
    elseif kind == "align" then
        set_beginning_value(context, operation, "justification",
            "position.justification", "justification")
    elseif kind == "color" then
        set_beginning_value(context, operation, "color", "style.color", "color")
    elseif kind == "font" then
        context.state.font = operation.value
        context:command("style.font", { font = operation.value })
    elseif kind == "underline" then
        context.state.underline = operation.value
        context:command("style.underline", { mode = operation.value })
    elseif kind == "emphasis" then
        context.state.emphasis = operation.enabled
        context:command("style.emphasis", { enabled = operation.enabled })
    elseif kind == "double_strike" then
        context.state.double_strike = operation.enabled
        context:command("style.double_strike", { enabled = operation.enabled })
    elseif kind == "upside_down" then
        set_beginning_toggle(context, operation, "upside_down", "style.upside_down")
    elseif kind == "double_width" or kind == "double_height" then
        context.state[kind] = operation.enabled
        print_mode(context)
    elseif kind == "spacing" then
        context.state.spacing = operation.value
        context:command("style.character_spacing", { half_dots = operation.value })
    elseif kind == "line_spacing" then
        if operation.value == "default" then
            context.state.line_spacing = context.profile.defaults.line_spacing_vertical_units
            context:command("motion.default_line_spacing")
        else
            context.state.line_spacing = operation.value
            context:command("motion.line_spacing", { vertical_units = operation.value })
        end
    elseif kind == "feed" then
        context:print_motion("print.feed_lines", { lines = operation.value },
            "feed_lines", operation.span)
    elseif kind == "feed_units" then
        context:print_motion("print.feed_units", { vertical_units = operation.value },
            "feed_units", operation.span)
    elseif kind == "reverse_lines" then
        context:print_motion("print.reverse_feed_lines", { lines = operation.value },
            "reverse_lines", operation.span)
    elseif kind == "reverse_units" then
        context:print_motion("print.reverse_feed_units", { vertical_units = operation.value },
            "reverse_units", operation.span)
    elseif kind == "cut" then
        handle_cut(context, operation)
    else
        return false
    end
    return true
end

return M
