local check = require("unit.support")
local Manifest = require("tm_u220.transport.live_raw.manifest")
local Process = require("tm_u220.transport.live_raw.process")

local tests = {}

local function plan()
    local first = string.char(0, 27, 64, 255)
    local second = "A\n"
    return {
        payload_bytes = first .. second,
        payload_byte_count = #first + #second,
        line_count = 1,
        steps = {
            { index = 1, kind = "control", payload_bytes = first,
                reset_after_byte_offsets = {} },
            { index = 2, kind = "line", payload_bytes = second,
                display = "001 | A", preview_line_index = 1,
                reset_after_byte_offsets = {} },
        },
    }
end

local ROUTE = { host = "192.168.50.41", port = 9100, timeout = 30,
    source_ports = { 1023, 1021, 1020 } }

local function endpoint() return { host = ROUTE.host, port = ROUTE.port } end

local function live_options(values)
    values = values or {}
    values.route = ROUTE
    return values
end

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

local function runtime(callback)
    local paths, removed = {}, {}
    return {
        helper_path = "/project/libexec/tm-u220-live-session.mjs",
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

tests[#tests + 1] = { "live manifest preserves binary bytes and silent only as metadata", function()
    local visible = assert(Manifest.build(plan(), endpoint(),
        live_options({ silent = false })))
    local silent = assert(Manifest.build(plan(), endpoint(),
        live_options({ silent = true })))
    check.equal(visible.steps[1].payload_hex, "001b40ff")
    check.equal(visible.steps[2].payload_hex, "410a")
    check.equal(visible.steps[2].display, "001 | A")
    check.equal(#visible.steps[1].reset_after_byte_offsets, 0)
    check.equal(visible.silent, false)
    check.equal(silent.silent, true)
    check.equal(silent.steps[1].payload_hex, visible.steps[1].payload_hex)
    check.equal(silent.steps[2].payload_hex, visible.steps[2].payload_hex)
    check.equal(#visible.source_ports, #ROUTE.source_ports)
end }

tests[#tests + 1] = { "live process parses completion and cleans temporary files", function()
    local seen
    local rt, paths, removed = runtime(function(spec)
        check.equal(spec.helper_path, "/project/libexec/tm-u220-live-session.mjs")
        seen = read(spec.plan_path)
        write(spec.result_path, "completed\t1023\t2\t1\t6\t6\n")
        return { ok = true, exit_code = 0 }
    end)
    local manifest = assert(Manifest.build(plan(), endpoint(), live_options()))
    local result = assert(Process.submit(manifest, rt))
    check.contains(seen, '"payload_hex":"001b40ff"')
    check.equal(result.status, "completed")
    check.equal(result.source_port, 1023)
    check.equal(result.bytes_submitted, 6)
    for _, path in ipairs(paths) do check.truthy(removed[path]) end
end }

tests[#tests + 1] = { "live process distinguishes cancellation", function()
    local rt = runtime(function(spec)
        write(spec.result_path, "cancelled\t1021\t1\t0\t4\t6\n")
        return { ok = false, exit_code = 130 }
    end)
    local manifest = assert(Manifest.build(plan(), endpoint(), live_options()))
    local result = assert(Process.submit(manifest, rt))
    check.equal(result.cancelled, true)
    check.equal(result.lines_confirmed, 0)
    check.equal(result.bytes_submitted, 4)
end }

tests[#tests + 1] = { "live process preserves an unknown checkpoint outcome", function()
    local rt = runtime(function(spec)
        write(spec.result_path, table.concat({
            "error", "LIVE_CHECKPOINT_FAILED", "checkpoint", "2", "1", "0",
            "4", "6", "1", "status%20timeout", "1021",
        }, "\t") .. "\n")
        return { ok = false, exit_code = 1 }
    end)
    local manifest = assert(Manifest.build(plan(), endpoint(), live_options()))
    local result, message, detail = Process.submit(manifest, rt)
    check.equal(result, nil)
    check.equal(message, "status timeout")
    check.equal(detail.code, "LIVE_CHECKPOINT_FAILED")
    check.equal(detail.step, 2)
    check.equal(detail.bytes_confirmed, 4)
    check.equal(detail.bytes_released, 6)
    check.equal(detail.outcome_unknown, true)
end }

tests[#tests + 1] = { "live process rejects partial completion claims", function()
    local rt = runtime(function(spec)
        write(spec.result_path, "completed\t1023\t1\t0\t4\t6\n")
        return { ok = true, exit_code = 0 }
    end)
    local manifest = assert(Manifest.build(plan(), endpoint(), live_options()))
    local result, message = Process.submit(manifest, rt)
    check.equal(result, nil)
    check.contains(message, "do not match the plan")
end }

tests[#tests + 1] = { "live process preserves a well-formed plan rejection", function()
    local rt = runtime(function(spec)
        write(spec.result_path, table.concat({
            "error", "LIVE_PLAN_REJECTED", "plan", "0", "0", "0",
            "0", "0", "0", "bad%20plan", "0",
        }, "\t") .. "\n")
        return { ok = false, exit_code = 2 }
    end)
    local manifest = assert(Manifest.build(plan(), endpoint(), live_options()))
    local result, message, detail = Process.submit(manifest, rt)
    check.equal(result, nil)
    check.equal(message, "bad plan")
    check.equal(detail.code, "LIVE_PLAN_REJECTED")
    check.equal(detail.source_port, nil)
end }

return tests
