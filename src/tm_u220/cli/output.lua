-- Owns CLI stdout, stderr, diagnostics, and file-output routing for every command handler.
-- Injected streams receive the same complete byte strings as the real process streams.
local Diagnostics = require("tm_u220.core.diagnostics")
local Fs = require("tm_u220.core.fs")

local M = {}
local Adapter = {}
Adapter.__index = Adapter

local function default_error(value)
    io.stderr:write(value)
end

function M.new(runtime)
    runtime = runtime or {}
    return setmetatable({
        write = runtime.write or io.write,
        write_error = runtime.write_error or default_error,
    }, Adapter)
end

function Adapter:stdout(value)
    self.write(value)
end

function Adapter:stderr(value)
    self.write_error(value)
end

function Adapter:line(value)
    self:stdout(tostring(value) .. "\n")
end

function Adapter:error_line(value)
    self:stderr(tostring(value) .. "\n")
end

function Adapter:diagnostics(items, warnings_only)
    for _, item in ipairs(items or {}) do
        if not warnings_only or item.severity ~= "error" then
            self:error_line(Diagnostics.format(item))
        end
    end
end

function Adapter:result(path, value, binary)
    if path == nil or path == "-" then
        self:stdout(value)
        return 0
    end
    local ok, err = Fs.write(path, value, binary)
    if not ok then
        self:error_line(err)
        return 1
    end
    return 0
end

function Adapter:usage_error(reason)
    self:stderr(string.format(
        "220: %s; run '220 help' for usage\n", tostring(reason)))
    return 2
end

return M
