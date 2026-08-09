-- Exposes the stable compilation, inspection, profile, and transport API.
local bytes = require("tm_u220.core.bytes")
local discovery = require("tm_u220.profile.discovery")
local escpos = require("tm_u220.escpos.parser")
local jobs = require("tm_u220.app.job_service")
local profile_file = require("tm_u220.profile.file")
local profile_spec = require("tm_u220.spec.profile")
local print_service = require("tm_u220.app.print_service")
local lpd = require("tm_u220.transport.lpd")
local raw_tcp = require("tm_u220.transport.raw_tcp")

local M = {}

function M.compile(source, options)
    return jobs.compile_source(source, options)
end

function M.compile_content(source, options)
    return jobs.compile_content(source, options)
end

function M.inspect(value, input_kind)
    if input_kind == "hex" then
        local decoded, err = bytes.from_hex(value)
        if not decoded then
            return {
                nodes = {},
                diagnostics = {
                    { severity = "error", code = "INPUT_INVALID_HEX", message = err },
                },
            }
        end
        value = decoded
    elseif input_kind ~= nil and input_kind ~= "raw" then
        return {
            nodes = {},
            diagnostics = {
                {
                    severity = "error",
                    code = "INPUT_INVALID_KIND",
                    message = "input kind must be raw or hex",
                },
            },
        }
    end
    return escpos.parse(value)
end

M.profile = {
    create = profile_spec.new,
    parse_file = profile_file.parse,
    serialize_file = profile_file.serialize,
    discovery = discovery,
}

M.print_file = print_service.print
M.transport = { lpd = lpd, raw_tcp = raw_tcp }

return M
