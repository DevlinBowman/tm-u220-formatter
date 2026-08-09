local M = {}

function M.new(code, message, span, severity)
    return {
        code = assert(code),
        message = assert(message),
        severity = severity or "error",
        span = span or {},
    }
end

function M.has_errors(items)
    for _, item in ipairs(items or {}) do
        if item.severity == "error" then
            return true
        end
    end
    return false
end

function M.format(item)
    local where = ""
    item.span = item.span or {}
    if item.span.start_line then
        where = "line " .. item.span.start_line .. ": "
    elseif item.span.line then
        where = "line " .. item.span.line .. ": "
    elseif item.span.first then
        where = "byte " .. item.span.first .. ": "
    end
    return string.format("%s[%s] %s%s", item.severity, item.code, where, item.message)
end

return M
