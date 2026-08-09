-- Plans Unicode formatter text into resident code-page bytes while preserving display text and cell counts.
-- It owns page-run grouping, wrapping, and visible substitution diagnostics, but delegates command emission to Context.
local Charset = require("tm_u220.charset.encoder")
local Utf8 = require("tm_u220.charset.utf8")
local state_api = require("tm_u220.format.state")

local M = {}

function M.validate(context, value, span)
    if type(value) ~= "string" then
        context:add_diagnostic("FORMAT_INVALID_TEXT", "text must be a string", span)
        return nil
    end
    local scalars, failure = Utf8.decode(value)
    if not scalars then
        context:add_diagnostic("FORMAT_INVALID_UTF8", failure.message, span)
        return nil
    end
    for index, scalar in ipairs(scalars) do
        if scalar.codepoint < 0x20 or scalar.codepoint == 0x7F then
            context:add_diagnostic(
                "FORMAT_UNSUPPORTED_CHARACTER",
                string.format("text contains unsupported control U+%04X at character %d",
                    scalar.codepoint, index),
                span
            )
            return nil
        end
    end
    return scalars
end

function M.cells(context, value, span)
    local scalars = M.validate(context, value, span)
    return scalars and #scalars or nil
end

function M.slice(value, first, count)
    return Utf8.slice(value, first, count)
end

local function report_substitutions(context, encoded, span)
    if encoded.substituted == 0 then return end
    local first = encoded.substitutions[1]
    local message
    if encoded.substituted == 1 then
        message = string.format(
            "Unicode glyph U+%04X is not available in the active resident code pages; printed ?",
            first.codepoint)
    else
        message = string.format(
            "%d Unicode glyphs are not available in the active resident code pages; printed ?",
            encoded.substituted)
    end
    context:add_diagnostic("FORMAT_GLYPH_SUBSTITUTED", message, span, "warning")
end

local function emit_tokens(context, tokens, first, count, span)
    local last = first + count - 1
    local cursor = first
    while cursor <= last do
        local page = tokens[cursor].page
        local bytes, display = {}, {}
        local run_first = cursor
        while cursor <= last and tokens[cursor].page == page do
            bytes[#bytes + 1] = string.char(tokens[cursor].byte)
            display[#display + 1] = tokens[cursor].char
            cursor = cursor + 1
        end
        context:select_code_table(page)
        context:emit_text(
            table.concat(display), table.concat(bytes), cursor - run_first,
            span, page)
    end
end

function M.write(context, value, span)
    local scalars = M.validate(context, value, span)
    if not scalars then return false end
    local default_page = context.profile.defaults.code_table
    local cursor = 1
    while cursor <= #scalars do
        local remaining = state_api.remaining(context.state)
        if remaining == 0 then
            context:line_feed("wrap", span)
            remaining = state_api.remaining(context.state)
        end
        if remaining == 0 then
            context:add_diagnostic(
                "FORMAT_CHARACTER_TOO_WIDE",
                "current font and spacing cannot fit on the selected paper",
                span
            )
            return false
        end

        local count = math.min(remaining, #scalars - cursor + 1)
        local chunk = Utf8.slice(value, cursor, count)
        local encoded, failure = Charset.encode(
            chunk, context.state.code_table, default_page,
            context.state.code_table_lock)
        if not encoded then
            context:add_diagnostic("FORMAT_CHARSET_ERROR", failure.message, span)
            return false
        end
        report_substitutions(context, encoded, span)
        emit_tokens(context, encoded.tokens, 1, #encoded.tokens, span)
        cursor = cursor + count
        if cursor <= #scalars then context:line_feed("wrap", span) end
    end
    return true
end

return M
