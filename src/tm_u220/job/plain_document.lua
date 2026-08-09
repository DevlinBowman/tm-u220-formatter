local Diagnostic = require("tm_u220.job.diagnostic")

local M = {}

local function split_lines(source)
    source = source:gsub("\r\n", "\n"):gsub("\r", "\n")
    local lines, cursor = {}, 1
    while true do
        local newline = source:find("\n", cursor, true)
        if not newline then
            if cursor <= #source then
                lines[#lines + 1] = source:sub(cursor)
            end
            return lines
        end
        lines[#lines + 1] = source:sub(cursor, newline - 1)
        cursor = newline + 1
        if cursor > #source then return lines end
    end
end

function M.parse(source)
    local document = {
        version = 1,
        profile = {},
        ops = {},
        diagnostics = {},
    }
    if type(source) ~= "string" then
        document.diagnostics[1] = Diagnostic.error(
            "job.input.invalid_type", "plain document source must be a string")
        return document
    end

    for line_number, line in ipairs(split_lines(source)) do
        local span = Diagnostic.line_span(line_number)
        if line == "" then
            document.ops[#document.ops + 1] = { kind = "line", span = span }
        else
            document.ops[#document.ops + 1] = {
                kind = "text_line", text = line, span = span,
            }
        end
    end
    return document
end

return M
