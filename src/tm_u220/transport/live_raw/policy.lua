-- Enforces transport invariants around a route supplied by the installed printing manifest.
-- Machine-specific endpoint and source-port choices do not live in this module.
local M = {}

M.timeout_ms = 10000
M.maximum_timeout_ms = 25000
M.maximum_payload_size = 1024 * 1024
M.helper_name = "tm-u220-live-session.mjs"

local function route_valid(route)
    if type(route) ~= "table" or type(route.host) ~= "string"
        or type(route.port) ~= "number" or type(route.timeout) ~= "number"
        or type(route.source_ports) ~= "table" or #route.source_ports == 0 then
        return false
    end
    for _, port in ipairs(route.source_ports) do
        if type(port) ~= "number" or port % 1 ~= 0 or port < 1 or port > 1023 then
            return false
        end
    end
    return true
end

function M.validate(plan, endpoint, options)
    options = options or {}
    if type(plan) ~= "table" or type(plan.steps) ~= "table"
        or type(plan.payload_bytes) ~= "string" then
        return nil, "live checkpoint plan is invalid"
    end
    if plan.payload_bytes == "" then return nil, "refusing an empty live payload" end
    if #plan.payload_bytes > M.maximum_payload_size then
        return nil, "live payload exceeds the 1 MiB safety limit"
    end
    local route = options.route
    if not route_valid(route) then
        return nil, "installed live route is missing or invalid"
    end
    if type(endpoint) ~= "table" or endpoint.host ~= route.host
        or endpoint.port ~= route.port then
        return nil, "live endpoint differs from the installed printing manifest"
    end
    if options.silent ~= nil and type(options.silent) ~= "boolean" then
        return nil, "silent must be true or false"
    end
    local timeout_ms = options.timeout_ms or M.timeout_ms
    if type(timeout_ms) ~= "number" or timeout_ms % 1 ~= 0
        or timeout_ms < 1000 or timeout_ms > M.maximum_timeout_ms then
        return nil, "live timeout must be from 1000 through 25000 milliseconds"
    end
    return true, route
end

return M
