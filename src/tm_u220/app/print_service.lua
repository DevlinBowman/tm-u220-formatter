-- Compiles one input and hands the exact successful byte stream to a selected transport.
local Diagnostics = require("tm_u220.core.diagnostics")
local JobService = require("tm_u220.app.job_service")
local LivePrintService = require("tm_u220.app.live_print_service")
local Lpd = require("tm_u220.transport.lpd")
local RawTcp = require("tm_u220.transport.raw_tcp")

local M = {}

local function copy_diagnostics(items)
    local result = {}
    for _, item in ipairs(items or {}) do result[#result + 1] = item end
    return result
end

local function add(result, code, message)
    result.diagnostics[#result.diagnostics + 1] = Diagnostics.new(code, message)
end

local function compile_options(options)
    return {
        alias_path = options.alias_path,
        profile = options.profile,
        profile_path = options.profile_path,
        string_input = options.string_input,
        text = options.text,
    }
end

local function transport_options(options)
    return {
        queue = options.queue,
        timeout = options.timeout,
        source_ports = options.source_ports,
        sudo = options.sudo,
        route = options.printing_policy and options.printing_policy.routes.lpd or nil,
    }
end

local function select_transport(options, dependencies)
    if dependencies.transport then return dependencies.transport end
    if options.transport == "lpd" then return Lpd end
    return RawTcp
end

function M.print(path, options, dependencies)
    options = options or {}
    dependencies = dependencies or {}
    local jobs = dependencies.job_service or JobService

    local compile = jobs.compile_input or jobs.compile
    local compiled_ok, compiled = pcall(compile, path, compile_options(options))
    if not compiled_ok then
        return {
            diagnostics = { Diagnostics.new("PRINT_COMPILE_FAILED",
                "job compilation failed: " .. tostring(compiled)) },
        }
    end
    if type(compiled) ~= "table" then
        return {
            diagnostics = { Diagnostics.new("PRINT_COMPILE_FAILED",
                "job compiler returned an invalid result") },
        }
    end

    local result = {
        compilation = compiled,
        diagnostics = copy_diagnostics(compiled.diagnostics),
    }
    if Diagnostics.has_errors(result.diagnostics) then return result end
    if type(compiled.bytes) ~= "string" or compiled.bytes == "" then
        add(result, "PRINT_BYTES_MISSING",
            "successful compilation did not produce printer bytes")
        return result
    end

    if options.delivery == "live" then
        local service = dependencies.live_service or LivePrintService
        if type(service) ~= "table" or type(service.submit) ~= "function" then
            add(result, "LIVE_SERVICE_UNAVAILABLE", "live print service is unavailable")
            return result
        end
        local called, submission, failure, plan = pcall(
            service.submit, compiled, options, dependencies.live_dependencies)
        if not called then
            add(result, "LIVE_SERVICE_FAILED",
                "live print service failed: " .. tostring(submission))
            return result
        end
        result.live_plan = plan
        if not submission then
            if type(failure) == "table" then
                result.diagnostics[#result.diagnostics + 1] = failure
            else
                add(result, "LIVE_SERVICE_FAILED",
                    "live print service returned no submission result")
            end
            return result
        end
        if type(submission) ~= "table" then
            add(result, "LIVE_SERVICE_FAILED",
                "live print service returned an invalid submission result")
            return result
        end
        result.submission = submission
        return result
    end

    local transport = select_transport(options, dependencies)
    local submit_ok, submission, failure = pcall(transport.submit,
        compiled.bytes,
        { host = options.host, port = options.port },
        transport_options(options),
        dependencies.transport_dependencies)
    if not submit_ok then
        add(result, "PRINT_TRANSPORT_FAILED",
            "printer submission failed: " .. tostring(submission))
        return result
    end
    if not submission then
        if type(failure) == "table" then
            result.diagnostics[#result.diagnostics + 1] = failure
        else
            add(result, "PRINT_TRANSPORT_FAILED",
                "printer transport returned no submission result")
        end
        return result
    end
    if type(submission) ~= "table" then
        add(result, "PRINT_TRANSPORT_FAILED",
            "printer transport returned an invalid submission result")
        return result
    end

    result.submission = submission
    return result
end

return M
