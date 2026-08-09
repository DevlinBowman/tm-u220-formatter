local check = require("unit.support")
local Envelope = require("tm_u220.transport.lpd.envelope")
local Protocol = require("tm_u220.transport.lpd.protocol")

local tests = {}

local function envelope()
    return assert(Envelope.build(string.char(0x1B, 0x00, 0x41), {
        queue = "lp", client_host = "host", user = "user", job_id = 9,
    }))
end

local function scripted(options)
    options = options or {}
    local session = { events = {}, writes = {}, reads = 0 }
    function session:write_all(value, stage)
        local index = #self.writes + 1
        self.events[#self.events + 1] = "write:" .. stage
        self.writes[index] = value
        if options.write_failure == index then return nil, "injected write failure" end
        return true
    end
    function session:read_exact(count, stage)
        check.equal(count, 1)
        self.reads = self.reads + 1
        self.events[#self.events + 1] = "read:" .. stage
        if options.read_failure == self.reads then
            return nil, { kind = "timeout", message = "injected timeout" }
        end
        return string.char(options.nack == self.reads and 5 or 0)
    end
    return session
end

tests[#tests + 1] = { "LPD protocol waits for five ACKs and preserves stage bytes", function()
    local job = envelope()
    local session = scripted()
    local result = Protocol.run(job, session)
    local stages = Protocol.stages(job)

    check.equal(result.ok, true)
    check.equal(result.status, "accepted")
    check.equal(result.ack_count, 5)
    check.equal(result.lpd_acceptance, "accepted")
    check.equal(result.physical_outcome, "unknown")
    check.equal(#session.writes, 5)
    for index, stage in ipairs(stages) do
        check.equal(session.writes[index], stage.bytes)
        check.equal(session.events[(index * 2) - 1], "write:" .. stage.id)
        check.equal(session.events[index * 2], "read:" .. stage.id)
    end
    check.equal(session.writes[5], job.payload .. string.char(0))
end }

tests[#tests + 1] = { "LPD protocol stops immediately on every negative ACK", function()
    local stages = Protocol.stages(envelope())
    for index, stage in ipairs(stages) do
        local session = scripted({ nack = index })
        local result = Protocol.run(envelope(), session)
        check.equal(result.ok, false)
        check.equal(result.status, "rejected")
        check.equal(result.failure_kind, "nack")
        check.equal(result.stage, stage.id)
        check.equal(result.ack, 5)
        check.equal(result.ack_count, index)
        check.equal(result.lpd_acceptance, "rejected")
        check.equal(#session.writes, index)
        check.equal(session.reads, index)
    end
end }

tests[#tests + 1] = { "LPD protocol never advances after read or write failure", function()
    for index = 1, 5 do
        local read_session = scripted({ read_failure = index })
        local read_result = Protocol.run(envelope(), read_session)
        check.equal(read_result.ok, false)
        check.equal(read_result.failure_kind, "timeout")
        check.equal(#read_session.writes, index)
        check.equal(read_session.reads, index)
        check.equal(read_result.lpd_acceptance, "unknown")

        local write_session = scripted({ write_failure = index })
        local write_result = Protocol.run(envelope(), write_session)
        check.equal(write_result.ok, false)
        check.equal(write_result.failure_kind, "write_failed")
        check.equal(#write_session.writes, index)
        check.equal(write_session.reads, index - 1)
        check.equal(write_result.lpd_acceptance, "unknown")
    end
end }

tests[#tests + 1] = { "LPD protocol rejects malformed session ACKs", function()
    local session = scripted()
    function session:read_exact(_, stage)
        self.reads = self.reads + 1
        self.events[#self.events + 1] = "read:" .. stage
        return "\0\0"
    end
    local result = Protocol.run(envelope(), session)
    check.equal(result.ok, false)
    check.equal(result.failure_kind, "invalid_ack")
    check.equal(#session.writes, 1)
end }

return tests
