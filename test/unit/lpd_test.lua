local check = require("unit.support")
local Lpd = require("tm_u220.transport.lpd")

local tests = {}

local function accepted_session(nack_at)
    local session = { writes = {}, reads = 0, closed = 0 }
    function session:write_all(value, stage)
        self.writes[#self.writes + 1] = { value = value, stage = stage }
        return true
    end
    function session:read_exact()
        self.reads = self.reads + 1
        return string.char(self.reads == nack_at and 1 or 0)
    end
    function session:close()
        self.closed = self.closed + 1
        return true
    end
    return session
end

local function identity()
    return { client_host = "host", user = "user", job_id = 12 }
end

tests[#tests + 1] = { "LPD submit uses safe defaults and exact compiled bytes", function()
    local payload = string.char(0x1B, 0x40, 0x00, 0x5A)
    local session, opened = accepted_session()
    local adapter = { open = function(endpoint, options)
        opened = { endpoint = endpoint, options = options }
        return session
    end }
    local result, err = Lpd.submit(payload, { host = "printer.local" }, {}, {
        session_adapter = adapter, identity = identity(),
    })
    check.truthy(result, err and err.message)
    check.equal(opened.endpoint.host, "printer.local")
    check.equal(opened.endpoint.port, 515)
    check.equal(opened.options.timeout, 5)
    check.equal(opened.options.source_port, nil)
    check.equal(opened.options.sudo, false)
    check.equal(session.writes[1].value, string.char(2) .. "lp\n")
    check.equal(session.writes[5].value, payload .. string.char(0))
    check.equal(session.closed, 1)
    check.equal(result.bytes_submitted, #payload)
    check.equal(result.ack_count, 5)
    check.equal(result.lpd_acceptance, "accepted")
    check.equal(result.printer_acceptance, "unknown")
    check.equal(result.physical_outcome, "unknown")
end }

tests[#tests + 1] = { "LPD rotates only after a confirmed pre-connection bind collision", function()
    local opens, session = {}, accepted_session()
    local adapter = { open = function(_, options)
        opens[#opens + 1] = options.source_port
        if #opens == 1 then
            return nil, {
                kind = "bind_in_use", connected = false, bytes_sent = 0,
                message = "local source port is busy",
            }
        end
        return session
    end }
    local result = assert(Lpd.submit("X", { host = "printer" }, {
        source_ports = { 1023, 1022 }, sudo = true,
        client_host = "host", user = "user", job_id = 1,
    }, { session_adapter = adapter }))
    check.equal(#opens, 2)
    check.equal(opens[1], 1023)
    check.equal(opens[2], 1022)
    check.equal(result.source_port, 1022)
end }

tests[#tests + 1] = { "LPD never retries after a connection or protocol outcome", function()
    local open_count = 0
    local adapter = { open = function()
        open_count = open_count + 1
        return accepted_session(2)
    end }
    local result, err = Lpd.submit("X", { host = "printer" }, {
        source_ports = { 1023, 1022 }, sudo = true,
        client_host = "host", user = "user", job_id = 1,
    }, { session_adapter = adapter })
    check.equal(result, nil)
    check.equal(err.code, "LPD_REJECTED")
    check.equal(err.stage, "control_header")
    check.equal(err.ack, 1)
    check.equal(err.lpd_acceptance, "rejected")
    check.equal(open_count, 1)

    open_count = 0
    adapter.open = function()
        open_count = open_count + 1
        return nil, {
            kind = "bind_in_use", connected = true, bytes_sent = 0,
            message = "not a pre-connection bind failure",
        }
    end
    result, err = Lpd.submit("X", { host = "printer" }, {
        source_ports = { 1023, 1022 },
        client_host = "host", user = "user", job_id = 1,
    }, { session_adapter = adapter })
    check.equal(result, nil)
    check.equal(err.code, "LPD_CONNECT_FAILED")
    check.equal(open_count, 1)
end }

tests[#tests + 1] = { "LPD validates everything before opening a session", function()
    local calls = 0
    local adapter = { open = function()
        calls = calls + 1
        return accepted_session()
    end }
    local cases = {
        { "", { host = "printer" }, {}, "LPD_INVALID_ENVELOPE" },
        { "X", { host = "bad host" }, {}, "LPD_INVALID_HOST" },
        { "X", { host = "printer", port = 0 }, {}, "LPD_INVALID_PORT" },
        { "X", { host = "printer" }, { timeout = 0 }, "LPD_INVALID_TIMEOUT" },
        { "X", { host = "printer" }, { sudo = true }, "LPD_UNNECESSARY_SUDO" },
        { "X", { host = "printer" }, { queue = "lp\nother" },
            "LPD_INVALID_ENVELOPE" },
    }
    for _, case in ipairs(cases) do
        local result, err = Lpd.submit(case[1], case[2], case[3], {
            session_adapter = adapter, identity = identity(),
        })
        check.equal(result, nil)
        check.equal(err.code, case[4])
    end
    check.equal(calls, 0)
end }

return tests
