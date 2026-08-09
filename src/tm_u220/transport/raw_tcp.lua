local Diagnostics = require("tm_u220.core.diagnostics")
local Netcat = require("tm_u220.transport.netcat")

local M = {}

local function diagnostic(code, message, fields)
    local item = Diagnostics.new(code, message)
    for key, value in pairs(fields or {}) do item[key] = value end
    return nil, item
end

local function is_integer(value)
    return type(value) == "number" and value == math.floor(value)
end

local function validate_host(value)
    if type(value) ~= "string" or value == "" then
        return nil, "printer host is required"
    end
    if #value > 255 or value:sub(1, 1) == "-"
        or not value:match("^[%w%.:_%%%-]+$") then
        return nil, "printer host must be an IP address or DNS name"
    end
    return value
end

local function validate_port(value, name)
    if not is_integer(value) or value < 1 or value > 65535 then
        return nil, name .. " must be an integer from 1 through 65535"
    end
    return value
end

local function source_ports(values)
    if values == nil then return { false } end
    if type(values) ~= "table" then
        return nil, "source_ports must be a non-empty list when supplied"
    end
    local count, maximum = 0, 0
    for key in pairs(values) do
        if not is_integer(key) or key < 1 then
            return nil, "source_ports must contain only ordered list entries"
        end
        count = count + 1
        maximum = math.max(maximum, key)
    end
    if count == 0 then
        return nil, "source_ports must be a non-empty list when supplied"
    end
    if maximum ~= count then return nil, "source_ports must not contain gaps" end
    local result, seen = {}, {}
    for index = 1, count do
        local value = values[index]
        local port, err = validate_port(value, "source_ports[" .. index .. "]")
        if not port then return nil, err end
        if seen[port] then return nil, "source_ports may not contain duplicates" end
        seen[port] = true
        result[#result + 1] = port
    end
    return result
end

local function failure_message(attempt)
    local detail = tostring(attempt.stderr or ""):gsub("%s+$", "")
    if detail == "" then detail = "transport process failed" end
    return "TCP submission failed: " .. detail
end

function M.submit(payload, endpoint, options, dependencies)
    options = options or {}
    dependencies = dependencies or {}
    if type(payload) ~= "string" then
        return diagnostic("TRANSPORT_INVALID_PAYLOAD", "payload must be a byte string")
    end
    if payload == "" then
        return diagnostic("TRANSPORT_EMPTY_PAYLOAD", "refusing to submit an empty payload")
    end
    if type(endpoint) ~= "table" then
        return diagnostic("TRANSPORT_INVALID_ENDPOINT", "endpoint must be a table")
    end

    local host, err = validate_host(endpoint.host)
    if not host then return diagnostic("TRANSPORT_INVALID_HOST", err) end
    local port
    port, err = validate_port(endpoint.port or 9100, "printer port")
    if not port then return diagnostic("TRANSPORT_INVALID_PORT", err) end

    local timeout = options.timeout == nil and 5 or options.timeout
    if not is_integer(timeout) or timeout < 1 or timeout > 300 then
        return diagnostic("TRANSPORT_INVALID_TIMEOUT",
            "timeout must be an integer from 1 through 300 seconds")
    end
    if options.sudo ~= nil and type(options.sudo) ~= "boolean" then
        return diagnostic("TRANSPORT_INVALID_SUDO", "sudo must be true or false")
    end

    local ports
    ports, err = source_ports(options.source_ports)
    if not ports then return diagnostic("TRANSPORT_INVALID_SOURCE_PORTS", err) end
    if options.sudo and options.source_ports == nil then
        return diagnostic("TRANSPORT_UNNECESSARY_SUDO",
            "sudo is accepted only with explicit source_ports")
    end

    local adapter = dependencies.adapter or Netcat
    if type(adapter) ~= "table" or type(adapter.submit) ~= "function" then
        return diagnostic("TRANSPORT_INVALID_ADAPTER", "transport adapter is unavailable")
    end

    local last
    for index, value in ipairs(ports) do
        local source_port = value or nil
        local called, attempt = pcall(adapter.submit,
            payload, { host = host, port = port }, {
            timeout = timeout,
            source_port = source_port,
            sudo = options.sudo == true,
        }, dependencies.adapter_runtime)
        if not called then
            return diagnostic("TRANSPORT_ADAPTER_FAILED",
                "transport adapter failed: " .. tostring(attempt))
        end
        if type(attempt) ~= "table" then
            return diagnostic("TRANSPORT_ADAPTER_FAILED",
                "transport adapter returned an invalid result")
        end
        if attempt.ok then
            return {
                transport = "raw_tcp",
                host = host,
                port = port,
                source_port = source_port,
                bytes_submitted = #payload,
                stdout = attempt.stdout or "",
                stderr = attempt.stderr or "",
                printer_acceptance = "unknown",
                message = string.format(
                    "submitted %d bytes to %s:%d over TCP; printer acceptance is unknown",
                    #payload, host, port),
            }
        end
        last = attempt
        if not attempt.retryable_bind_in_use or index == #ports then break end
    end

    return diagnostic("TRANSPORT_SUBMIT_FAILED", failure_message(last or {}), {
        host = host,
        port = port,
        source_port = last and last.source_port or nil,
        exit_code = last and last.exit_code or nil,
        stdout = last and last.stdout or "",
        stderr = last and last.stderr or "",
        printer_acceptance = "unknown",
    })
end

return M
