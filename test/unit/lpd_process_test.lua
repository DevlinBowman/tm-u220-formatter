-- Verifies the fixed LPD helper boundary, result schema, and failure diagnostics.
local check = require("unit.support")
local Envelope = require("tm_u220.transport.lpd.envelope")
local Process = require("tm_u220.transport.lpd.process")

local tests = {}

local function read(path)
    local file = assert(io.open(path, "rb"))
    local value = file:read("*a")
    assert(file:close())
    return value
end

local function write(path, value)
    local file = assert(io.open(path, "wb"))
    assert(file:write(value))
    assert(file:close())
end

local ROUTE = {
    host = "192.168.50.41", port = 515, queue = "lp", timeout = 5,
    source_ports = { 731, 730, 729, 728, 727, 726, 725, 724, 723, 722, 721 },
}

local function options()
    local ports = {}
    for index, value in ipairs(ROUTE.source_ports) do ports[index] = value end
    return { timeout = 5, source_ports = ports, sudo = false, route = ROUTE }
end

local function endpoint()
    return { host = ROUTE.host, port = ROUTE.port }
end

local function runtime(callback)
    local paths, removed = {}, {}
    return {
        helper_path = "/project/libexec/tm-u220-lpd-session",
        tempname = function()
            local path = os.tmpname()
            paths[#paths + 1] = path
            return path
        end,
        remove = function(path)
            removed[path] = true
            return os.remove(path)
        end,
        runner = callback,
    }, paths, removed
end

tests[#tests + 1] = { "LPD process preserves arbitrary payload bytes", function()
    local payload = "A\r\n" .. string.char(0, 27, 64, 255) .. "Z"
    local envelope = assert(Envelope.build(payload, { job_id = 7 }))
    local seen
    local rt, paths, removed = runtime(function(spec)
        check.equal(spec.executable, "/project/libexec/tm-u220-lpd-session")
        check.equal(spec.sudo, nil)
        seen = read(spec.stdin_path)
        write(spec.stdout_path,
            "ok bytes=" .. #payload .. " acks=5 source_port=731\n")
        write(spec.stderr_path, "")
        return { ok = true, exit_code = 0 }
    end)
    local result = Process.submit(envelope, endpoint(), options(), rt)
    check.truthy(result.ok)
    check.equal(seen, payload)
    check.equal(result.source_port, 731)
    check.equal(result.ack_count, 5)
    for _, path in ipairs(paths) do check.truthy(removed[path]) end
end }

tests[#tests + 1] = { "LPD process refuses policy changes before execution", function()
    local envelope = assert(Envelope.build("X", { job_id = 8 }))
    local calls = 0
    local rt = { runner = function() calls = calls + 1 end }
    local result = Process.submit(envelope,
        { host = "192.168.50.42", port = 515 }, options(), rt)
    check.equal(result.ok, false)
    check.equal(result.code, "LPD_SESSION_POLICY_MISMATCH")
    check.equal(calls, 0)
end }

tests[#tests + 1] = { "LPD process enforces the one MiB limit", function()
    local envelope = assert(Envelope.build(string.rep("X", 1024 * 1024 + 1),
        { job_id = 9 }))
    local calls = 0
    local result = Process.submit(envelope, endpoint(), options(), {
        runner = function() calls = calls + 1 end,
    })
    check.equal(result.ok, false)
    check.contains(result.message, "1 MiB")
    check.equal(calls, 0)
end }

tests[#tests + 1] = { "LPD process distinguishes an explicit rejection", function()
    local envelope = assert(Envelope.build("X", { job_id = 10 }))
    local rt = runtime(function(spec)
        write(spec.stdout_path, "error code=lpd_rejected stage=data_header "
            .. "ack=1 acks=4 message=negative_ack source_port=729\n")
        write(spec.stderr_path, "")
        return { ok = false, exit_code = 40 }
    end)
    local result = Process.submit(envelope, endpoint(), options(), rt)
    check.equal(result.ok, false)
    check.equal(result.code, "LPD_REJECTED")
    check.equal(result.lpd_acceptance, "rejected")
    check.equal(result.stage, "data_header")
    check.equal(result.ack, 1)
    check.equal(result.source_port, 729)
end }

tests[#tests + 1] = { "LPD process preserves an unknown session outcome", function()
    local envelope = assert(Envelope.build("X", { job_id = 11 }))
    local rt = runtime(function(spec)
        write(spec.stdout_path, "error code=lpd_unknown stage=control_body "
            .. "ack=none acks=2 message=ack_timeout source_port=728\n")
        write(spec.stderr_path, "nc: timeout\n")
        return { ok = false, exit_code = 41 }
    end)
    local result = Process.submit(envelope, endpoint(), options(), rt)
    check.equal(result.ok, false)
    check.equal(result.code, "LPD_SESSION_FAILED")
    check.equal(result.lpd_acceptance, "unknown")
    check.equal(result.stage, "control_body")
    check.equal(result.ack_count, 2)
    check.equal(result.source_port, 728)
    check.contains(result.message, "control-body")
    check.contains(result.message, "nc: timeout")
end }

tests[#tests + 1] = { "LPD process gives an actionable authorization failure", function()
    local envelope = assert(Envelope.build("X", { job_id = 13 }))
    local rt = runtime(function(spec)
        write(spec.stdout_path, "error code=lpd_unknown stage=receive_job "
            .. "ack=none acks=0 message=ack_eof source_port=727\n")
        write(spec.stderr_path, "sudo: a password is required\n")
        return { ok = false, exit_code = 41 }
    end)
    local result = Process.submit(envelope, endpoint(), options(), rt)
    check.equal(result.ok, false)
    check.contains(result.message, "run 220 setup-printing")
    check.equal(result.stage, "receive_job")
    check.equal(result.ack_count, 0)
end }

tests[#tests + 1] = { "LPD process identifies an early connection close", function()
    local envelope = assert(Envelope.build("X", { job_id = 14 }))
    local rt = runtime(function(spec)
        write(spec.stdout_path, "error code=lpd_unknown stage=receive_job "
            .. "ack=none acks=0 message=ack_eof source_port=726\n")
        write(spec.stderr_path, "")
        return { ok = false, exit_code = 41 }
    end)
    local result = Process.submit(envelope, endpoint(), options(), rt)
    check.contains(result.message, "receive-job acknowledgement")
    check.contains(result.message, "0/5 received")
end }

tests[#tests + 1] = { "LPD process fails closed on malformed output", function()
    local envelope = assert(Envelope.build("X", { job_id = 12 }))
    local rt = runtime(function(spec)
        write(spec.stdout_path, "probably printed\n")
        write(spec.stderr_path, "")
        return { ok = true, exit_code = 0 }
    end)
    local result = Process.submit(envelope, endpoint(), options(), rt)
    check.equal(result.ok, false)
    check.equal(result.helper_code, "invalid_record")
end }

return tests
