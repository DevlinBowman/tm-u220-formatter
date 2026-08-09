local M = {}

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
