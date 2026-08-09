-- Resolves the friendly local print modes against the one installed machine policy.
-- Advanced raw TCP remains explicit and independent of this orchestration boundary.
local Installed = require("tm_u220.printing.installed")
local Fs = require("tm_u220.core.fs")
local Sha256 = require("tm_u220.core.sha256")

local M = {}

local function copy(values)
    local result = {}
    for key, value in pairs(values or {}) do result[key] = value end
    return result
end

local function profile_matches(path, policy, runtime)
    if path == policy.profile_path then return true end
    local read_profile = runtime and runtime.read_profile or function(value)
        return Fs.read(value, false)
    end
    local source, err = read_profile(path)
    if not source then return nil, err end
    return #source == policy.profile_bytes and Sha256.hex(source) == policy.profile_sha256
end

function M.resolve(options, runtime)
    options = copy(options)
    local live_route = options.delivery == "live"
    local local_route = live_route or options.transport == "lpd"
    if not local_route then return options end

    local loader = runtime and runtime.loader or Installed
    local policy, err = loader.load(runtime and runtime.installed_runtime)
    if not policy then return nil, err end
    if options.profile_path then
        local matches, profile_err = profile_matches(options.profile_path, policy, runtime)
        if not matches then
            return nil, profile_err or "local printing profile differs from the installed physical profile; "
                .. "run 220 setup-printing to change this printer's canonical profile"
        end
    end
    local route = live_route and policy.routes.live or policy.routes.lpd
    options.host = route.host
    options.port = route.port
    if live_route then
        options.status_timeout_seconds = options.timeout
        options.timeout = nil
    else
        options.timeout = options.timeout or route.timeout
    end
    options.source_ports = route.source_ports
    options.queue = route.queue
    options.sudo = false
    options.profile_path = policy.profile_path
    options.printing_policy = policy
    return options
end

return M
