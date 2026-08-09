local bytes = require("tm_u220.core.bytes")
local diagnostics = require("tm_u220.core.diagnostics")
local escpos = require("tm_u220.escpos.parser")
local fs = require("tm_u220.core.fs")
local jobs = require("tm_u220.app.job_service")

local M = {}

local function read_stream(path, input_kind)
    local value, err = fs.read(path, input_kind == "raw")
    if not value then return nil, diagnostics.new("INPUT_READ_FAILED", err) end
    if input_kind == "hex" then
        value, err = bytes.from_hex(value)
        if not value then return nil, diagnostics.new("INPUT_INVALID_HEX", err) end
    end
    return value
end

function M.inspect(path, options)
    options = options or {}
    local stream
    if options.input_kind == "job" then
        local compiled = jobs.compile(path, options)
        if not compiled.bytes then return compiled end
        stream = compiled.bytes
    else
        local failure
        stream, failure = read_stream(path, options.input_kind)
        if not stream then return { diagnostics = { failure } } end
    end
    return escpos.parse(stream)
end

return M
