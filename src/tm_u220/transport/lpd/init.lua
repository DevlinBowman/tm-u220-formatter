local Diagnostics = require("tm_u220.core.diagnostics")
local Envelope = require("tm_u220.transport.lpd.envelope")
local Process = require("tm_u220.transport.lpd.process")
local SessionSubmit = require("tm_u220.transport.lpd.session_submit")

local M = {}

local function diagnostic(code, message, fields)
    local item = Diagnostics.new(code, message)
    for key, value in pairs(fields or {}) do item[key] = value end
    return nil, item
end

local function is_integer(value)
    return type(value) == "number" and value == math.floor(value)
end

local function host(value)
    if type(value) ~= "string" or value == "" then
        return nil, "printer host is required"
    end
    if #value > 255 or value:sub(1, 1) == "-"
        or not value:match("^[A-Za-z0-9%.:_%%-]+$") then
        return nil, "printer host must be an IP address or DNS name"
    end
    return value
end

local function port(value, label)
    if not is_integer(value) or value < 1 or value > 65535 then
        return nil, label .. " must be an integer from 1 through 65535"
    end
    return value
end

local function source_ports(options)
    if options.source_port ~= nil and options.source_ports ~= nil then
        return nil, "use source_port or source_ports, not both"
    end
    local values = options.source_ports
    if values == nil and options.source_port ~= nil then values = { options.source_port } end
    if values == nil then return { false } end
    if type(values) ~= "table" then return nil, "source_ports must be a list" end
    local count, maximum = 0, 0
    for key in pairs(values) do
        if not is_integer(key) or key < 1 then
            return nil, "source_ports must contain only ordered list entries"
        end
        count, maximum = count + 1, math.max(maximum, key)
    end
    if count == 0 or maximum ~= count then
        return nil, "source_ports must be a non-empty list without gaps"
    end
    local result, seen = {}, {}
    for index = 1, count do
        local value, err = port(values[index], "source_ports[" .. index .. "]")
        if not value then return nil, err end
        if seen[value] then return nil, "source_ports may not contain duplicates" end
        seen[value], result[index] = true, value
    end
    return result
end

local function envelope_options(options, dependencies)
    local identity = dependencies.identity or {}
    return {
        queue = options.queue,
        client_host = options.client_host or identity.client_host,
        user = options.user or identity.user,
        source_name = options.source_name,
        job_id = options.job_id or identity.job_id or (os.time() % 1000),
    }
end

function M.submit(payload, endpoint, options, dependencies)
    options, dependencies = options or {}, dependencies or {}
    if type(endpoint) ~= "table" then
        return diagnostic("LPD_INVALID_ENDPOINT", "endpoint must be a table")
    end
    local printer_host, err = host(endpoint.host)
    if not printer_host then return diagnostic("LPD_INVALID_HOST", err) end
    local printer_port
    printer_port, err = port(endpoint.port or 515, "printer port")
    if not printer_port then return diagnostic("LPD_INVALID_PORT", err) end
    local timeout = options.timeout == nil and 5 or options.timeout
    if not is_integer(timeout) or timeout < 1 or timeout > 300 then
        return diagnostic("LPD_INVALID_TIMEOUT",
            "timeout must be an integer from 1 through 300 seconds")
    end
    if options.sudo ~= nil and type(options.sudo) ~= "boolean" then
        return diagnostic("LPD_INVALID_SUDO", "sudo must be true or false")
    end
    local ports
    ports, err = source_ports(options)
    if not ports then return diagnostic("LPD_INVALID_SOURCE_PORTS", err) end
    if options.sudo and options.source_port == nil and options.source_ports == nil then
        return diagnostic("LPD_UNNECESSARY_SUDO",
            "sudo is accepted only with an explicit source port")
    end

    local envelope
    envelope, err = Envelope.build(payload, envelope_options(options, dependencies))
    if not envelope then return diagnostic("LPD_INVALID_ENVELOPE", err) end
    local endpoint_value = { host = printer_host, port = printer_port }
    local adapter_options = {
        timeout = timeout,
        source_ports = ports,
        sudo = options.sudo == true,
        route = options.route,
    }
    local outcome
    if dependencies.session_adapter then
        local adapter = dependencies.session_adapter
        if type(adapter) ~= "table" or type(adapter.open) ~= "function" then
            return diagnostic("LPD_ADAPTER_UNAVAILABLE", "LPD session adapter is unavailable")
        end
        outcome = SessionSubmit.run(envelope, endpoint_value, adapter_options,
            adapter, dependencies.session_runtime)
    else
        local adapter = dependencies.complete_adapter or Process
        if type(adapter) ~= "table" or type(adapter.submit) ~= "function" then
            return diagnostic("LPD_ADAPTER_UNAVAILABLE", "LPD helper adapter is unavailable")
        end
        local called
        called, outcome = pcall(adapter.submit, envelope, endpoint_value,
            adapter_options, dependencies.helper_runtime)
        if not called then
            outcome = { ok = false, code = "LPD_HELPER_FAILED",
                message = "LPD helper adapter failed: " .. tostring(outcome) }
        end
    end
    if type(outcome) ~= "table" then
        return diagnostic("LPD_ADAPTER_FAILED", "LPD adapter returned an invalid result")
    end
    if not outcome.ok then
        return diagnostic(outcome.code or "LPD_SESSION_FAILED",
            outcome.message or "LPD submission failed", {
                host = printer_host, port = printer_port,
                source_port = outcome.source_port,
                queue = envelope.queue, stage = outcome.stage,
                ack = outcome.ack, ack_count = outcome.ack_count,
                helper_code = outcome.helper_code,
                exit_code = outcome.exit_code,
                lpd_acceptance = outcome.lpd_acceptance or "unknown",
                physical_outcome = "unknown",
            })
    end
    return {
        transport = "lpd",
        host = printer_host,
        port = printer_port,
        queue = envelope.queue,
        source_port = outcome.source_port,
        bytes_submitted = #payload,
        protocol_bytes_written = outcome.protocol_bytes_written,
        acks = outcome.acks,
        ack_count = outcome.ack_count,
        lpd_acceptance = "accepted",
        printer_acceptance = "unknown",
        physical_outcome = "unknown",
        close_error = outcome.close_error,
        message = string.format(
            "queued: TM-U220 accepted the %d-byte job over LPD",
            #payload),
    }
end

return M
