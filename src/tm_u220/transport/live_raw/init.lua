-- Applies checkpointed live delivery without owning any machine-specific route data.
local Diagnostics = require("tm_u220.core.diagnostics")
local Manifest = require("tm_u220.transport.live_raw.manifest")
local Process = require("tm_u220.transport.live_raw.process")

local M = {}

local function diagnostic(code, message, fields)
    local item = Diagnostics.new(code, message)
    for key, value in pairs(fields or {}) do item[key] = value end
    return nil, item
end

function M.submit(plan, options, dependencies)
    options = options or {}
    dependencies = dependencies or {}
    local route = options.route
    local endpoint = type(route) == "table"
        and { host = route.host, port = route.port } or {}
    local manifest, err = Manifest.build(plan, endpoint, options)
    if not manifest then return diagnostic("LIVE_MANIFEST_INVALID", err) end
    local adapter = dependencies.adapter or Process
    if type(adapter) ~= "table" or type(adapter.submit) ~= "function" then
        return diagnostic("LIVE_ADAPTER_UNAVAILABLE", "live session adapter is unavailable")
    end
    local called, result, message, fields = pcall(
        adapter.submit, manifest, dependencies.runtime)
    if not called then
        return diagnostic("LIVE_ADAPTER_FAILED", "live session adapter failed: " .. result)
    end
    if not result then
        fields = fields or {}
        return diagnostic(fields.code or "LIVE_SESSION_FAILED",
            message or "live session failed", fields)
    end
    result.transport = "live-raw"
    result.host = route.host
    result.port = route.port
    result.payload_bytes = plan.payload_byte_count
    result.line_count = plan.line_count
    result.physical_outcome = "printer operations confirmed; ink transfer not observed"
    if result.cancelled then
        result.message = string.format(
            "cancelled: %d/%d printer lines confirmed; later operations were not sent",
            result.lines_confirmed, plan.line_count)
    else
        result.message = string.format(
            "printed: TM-U220 confirmed %d/%d printer lines over live RAW",
            result.lines_confirmed, plan.line_count)
    end
    return result
end

return M
