-- Validates one LPD session against the route supplied by the installed printing manifest.
-- The route's pool prevents rapid jobs from reusing one quarantined TCP connection.
local M = {}

M.maximum_payload_size = 1024 * 1024
M.helper_name = "tm-u220-lpd-session"

local function route_valid(route)
    if type(route) ~= "table" or type(route.host) ~= "string"
        or type(route.port) ~= "number" or type(route.timeout) ~= "number"
        or type(route.queue) ~= "string" or type(route.source_ports) ~= "table"
        or #route.source_ports == 0 then
        return false
    end
    return true
end

local function source_ports_match(values, expected)
    if type(values) ~= "table" then return false end
    local count = 0
    for key in pairs(values) do
        if type(key) ~= "number" or key ~= math.floor(key) or key < 1 then
            return false
        end
        count = count + 1
    end
    if count ~= #expected then return false end
    for index, value in ipairs(expected) do
        if values[index] ~= value then return false end
    end
    return true
end

function M.authorizes_source_port(value, route)
    for _, source_port in ipairs(route and route.source_ports or {}) do
        if value == source_port then return true end
    end
    return false
end

local function options_match(options, route)
    options = options or {}
    if type(options) ~= "table" then
        return nil, "LPD session options must be a table"
    end
    if options.sudo ~= nil and type(options.sudo) ~= "boolean" then
        return nil, "LPD session sudo option must be true or false"
    end
    if options.timeout ~= nil and options.timeout ~= route.timeout then
        return nil, "LPD session timeout differs from the installed printing manifest"
    end
    if options.sudo == true then
        return nil, "the LPD session helper manages its own narrow sudo command"
    end
    if options.source_port ~= nil then
        return nil, "LPD uses its complete fixed reserved-port pool"
    end
    if options.source_ports ~= nil then
        if not source_ports_match(options.source_ports, route.source_ports) then
            return nil, "LPD source ports differ from the installed printing manifest"
        end
    end
    return true
end

function M.validate(envelope, endpoint, options)
    if type(envelope) ~= "table" or type(envelope.payload) ~= "string" then
        return nil, "LPD envelope must contain a byte-string payload"
    end
    if envelope.payload == "" then return nil, "refusing to submit an empty payload" end
    if #envelope.payload > M.maximum_payload_size then
        return nil, "LPD payload exceeds the 1 MiB safety limit"
    end
    local route = options and options.route
    if not route_valid(route) then
        return nil, "installed LPD route is missing or invalid"
    end
    if envelope.queue ~= route.queue then
        return nil, "LPD queue differs from the installed printing manifest"
    end
    if type(endpoint) ~= "table"
        or endpoint.host ~= route.host or endpoint.port ~= route.port then
        return nil, "LPD endpoint differs from the installed printing manifest"
    end
    return options_match(options, route)
end

return M
