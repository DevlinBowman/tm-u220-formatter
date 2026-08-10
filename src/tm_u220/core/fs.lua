-- Provides the formatter's small synchronous file boundary for complete text/binary reads, bounded prefixes, and writes.
local M = {}

function M.read_prefix(path, maximum_bytes)
    if type(maximum_bytes) ~= "number" or maximum_bytes % 1 ~= 0
        or maximum_bytes < 1 then
        return nil, "read prefix size must be a positive integer"
    end
    if path == "-" then
        return nil, "cannot read a bounded prefix from standard input"
    end

    local handle, err = io.open(path, "rb")
    if not handle then
        return nil, string.format("cannot read %s: %s", tostring(path), tostring(err))
    end
    local value, read_error = handle:read(maximum_bytes)
    handle:close()
    if not value and read_error then
        return nil, string.format("cannot read %s: %s", tostring(path), tostring(read_error))
    end
    return value or ""
end

function M.read(path, binary)
    if path == "-" then
        return io.read("*a")
    end

    local handle, err = io.open(path, binary and "rb" or "r")
    if not handle then
        return nil, string.format("cannot read %s: %s", tostring(path), tostring(err))
    end

    local value = handle:read("*a")
    handle:close()
    return value
end

function M.write(path, value, binary)
    if not path or path == "-" then
        io.write(value)
        return true
    end

    local handle, err = io.open(path, binary and "wb" or "w")
    if not handle then
        return nil, string.format("cannot write %s: %s", tostring(path), tostring(err))
    end

    local ok, write_err = handle:write(value)
    handle:close()
    if not ok then
        return nil, string.format("cannot write %s: %s", tostring(path), tostring(write_err))
    end
    return true
end

return M
