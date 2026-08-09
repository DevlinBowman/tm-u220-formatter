local M = {}

function M.line_span(line)
    return {
        start_line = line,
        end_line = line,
    }
end

function M.error(code, message, span)
    local diagnostic = {
        severity = "error",
        code = code,
        message = message,
    }

    if span then
        diagnostic.span = span
    end

    return diagnostic
end

return M
