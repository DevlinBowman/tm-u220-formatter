local check = require("unit.support")
local RawTcp = require("tm_u220.transport.raw_tcp")

local tests = {}

tests[#tests + 1] = { "raw TCP submits exact bytes with safe defaults", function()
    local payload = string.char(0x1B, 0x40, 0x00, 0x41, 0x0A)
    local recorded
    local adapter = { submit = function(bytes, endpoint, options)
        recorded = { bytes = bytes, endpoint = endpoint, options = options }
        return { ok = true, stdout = "response", stderr = "notice" }
    end }

    local result, err = RawTcp.submit(payload, { host = "printer.local" }, nil, {
        adapter = adapter,
    })
    check.truthy(result, err and err.message)
    check.equal(recorded.bytes, payload)
    check.equal(recorded.endpoint.port, 9100)
    check.equal(recorded.options.timeout, 5)
    check.equal(recorded.options.source_port, nil)
    check.equal(recorded.options.sudo, false)
    check.equal(result.bytes_submitted, #payload)
    check.equal(result.stdout, "response")
    check.equal(result.stderr, "notice")
    check.equal(result.printer_acceptance, "unknown")
    check.contains(result.message, "printer acceptance is unknown")
end }

tests[#tests + 1] = { "raw TCP validates before invoking its adapter", function()
    local calls = 0
    local adapter = { submit = function()
        calls = calls + 1
        return { ok = true }
    end }
    local cases = {
        { "", { host = "printer" }, {}, "TRANSPORT_EMPTY_PAYLOAD" },
        { "X", { host = "bad host" }, {}, "TRANSPORT_INVALID_HOST" },
        { "X", { host = "printer", port = 0 }, {}, "TRANSPORT_INVALID_PORT" },
        { "X", { host = "printer" }, { timeout = 0 }, "TRANSPORT_INVALID_TIMEOUT" },
        { "X", { host = "printer" }, { source_ports = {} },
            "TRANSPORT_INVALID_SOURCE_PORTS" },
        { "X", { host = "printer" }, { source_ports = { [1] = 1023, [3] = 1021 } },
            "TRANSPORT_INVALID_SOURCE_PORTS" },
        { "X", { host = "printer" }, { sudo = true }, "TRANSPORT_UNNECESSARY_SUDO" },
    }
    for _, case in ipairs(cases) do
        local result, err = RawTcp.submit(case[1], case[2], case[3], { adapter = adapter })
        check.equal(result, nil)
        check.equal(err.code, case[4])
    end
    check.equal(calls, 0)
end }

tests[#tests + 1] = { "raw TCP rotates only after confirmed bind failure", function()
    local ports = {}
    local adapter = { submit = function(_, _, options)
        ports[#ports + 1] = options.source_port
        if #ports == 1 then
            return {
                ok = false,
                stderr = "nc: bind failed: Address already in use",
                retryable_bind_in_use = true,
                source_port = options.source_port,
            }
        end
        return { ok = true }
    end }
    local result = assert(RawTcp.submit("X", { host = "printer" }, {
        source_ports = { 1023, 1022 }, sudo = true,
    }, { adapter = adapter }))
    check.equal(#ports, 2)
    check.equal(ports[1], 1023)
    check.equal(ports[2], 1022)
    check.equal(result.source_port, 1022)
end }

tests[#tests + 1] = { "raw TCP never retries an ambiguous failure", function()
    local calls = 0
    local adapter = { submit = function(_, _, options)
        calls = calls + 1
        return {
            ok = false,
            exit_code = 1,
            stderr = "connection timed out",
            source_port = options.source_port,
            retryable_bind_in_use = false,
        }
    end }
    local result, err = RawTcp.submit("X", { host = "printer" }, {
        source_ports = { 1023, 1022 },
    }, { adapter = adapter })
    check.equal(result, nil)
    check.equal(err.code, "TRANSPORT_SUBMIT_FAILED")
    check.equal(err.printer_acceptance, "unknown")
    check.equal(calls, 1)
end }

return tests
