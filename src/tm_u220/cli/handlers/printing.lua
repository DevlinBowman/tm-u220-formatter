-- Implements job delivery and printing-policy lifecycle commands behind their injectable services.
-- Route resolution, device work, and presentation remain separate from parser orchestration.
local Diagnostics = require("tm_u220.core.diagnostics")
local ConfigFiles = require("tm_u220.config.files")
local PrintService = require("tm_u220.app.print_service")
local PrintingRoutes = require("tm_u220.app.printing_routes")
local PrintingStatus = require("tm_u220.app.printing_status")
local RemovePrinting = require("tm_u220.app.remove_printing")
local SetupPrinting = require("tm_u220.app.setup_printing")

local M = {}

local function authoring_options(parsed, runtime)
    local options = {}
    for name, value in pairs(parsed.options) do options[name] = value end
    if parsed.input ~= "-" then options.asset_root = "." end
    local files = runtime.config_files or ConfigFiles
    local facts = runtime.config_files_runtime
    local failure
    options.alias_path, failure = files.active_path("aliases", facts)
    if not options.alias_path then
        return nil, Diagnostics.new("AUTHORING_CONFIG_PATH_INVALID", failure)
    end
    options.image_profile_path, failure = files.active_path("image_profile", facts)
    if not options.image_profile_path then
        return nil, Diagnostics.new("AUTHORING_CONFIG_PATH_INVALID", failure)
    end
    local local_route = options.delivery == "live" or options.transport == "lpd"
    if not local_route and not options.profile_path then
        options.profile_path, failure = files.active_path("profile", facts)
        if not options.profile_path then
            return nil, Diagnostics.new("AUTHORING_CONFIG_PATH_INVALID", failure)
        end
    end
    return options
end

local function print_command(parsed, runtime, output)
    local service = runtime.print_service or PrintService
    local routes = runtime.printing_routes or PrintingRoutes
    local authored, config_failure = authoring_options(parsed, runtime)
    if not authored then
        output:diagnostics({ config_failure })
        return 1
    end
    local options, route_error = routes.resolve(authored,
        runtime.printing_routes_runtime)
    if not options then
        output:error_line(route_error)
        return 1
    end
    local result = service.print(parsed.input, options)
    if Diagnostics.has_errors(result.diagnostics) then
        output:diagnostics(result.diagnostics)
        return 1
    end
    output:diagnostics(result.diagnostics, true)
    local submission = result.submission
    output:line(submission.message)
    if parsed.options.verbose then
        output:line("profile: " .. result.compilation.profile.id)
        output:line("bytes: " .. tostring(submission.bytes_submitted))
        output:line("source port: " .. tostring(submission.source_port or "ephemeral"))
        if submission.queue then output:line("queue: " .. submission.queue) end
        if submission.ack_count then
            output:line("LPD acknowledgements: " .. tostring(submission.ack_count) .. "/5")
        end
        if submission.steps_confirmed then
            output:line("live checkpoints: " .. tostring(submission.steps_confirmed))
        end
        output:line("physical ink transfer: not observed")
    end
    return submission.cancelled and 130 or 0
end

local function service_command(service_name, default_service, runtime_name)
    return function(parsed, runtime, output)
        local service = runtime[service_name] or default_service
        local status, message = service.run(parsed.options, runtime[runtime_name])
        if status ~= 0 and message then output:error_line(message) end
        return status
    end
end

M.handlers = {
    print = print_command,
    ["setup-printing"] = service_command(
        "setup_printing", SetupPrinting, "setup_printing_runtime"),
    ["printing-status"] = service_command(
        "printing_status", PrintingStatus, "printing_status_runtime"),
    ["remove-printing"] = service_command(
        "remove_printing", RemovePrinting, "remove_printing_runtime"),
}

return M
