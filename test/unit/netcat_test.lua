local check = require("unit.support")
local Netcat = require("tm_u220.transport.netcat")

local tests = {}

local function read(path)
    local handle = assert(io.open(path, "rb"))
    local value = handle:read("*a") or ""
    assert(handle:close())
    return value
end

local function write(path, value)
    local handle = assert(io.open(path, "wb"))
    assert(handle:write(value))
    assert(handle:close())
end

local function runtime(runner)
    local paths = {}
    return {
        paths = paths,
        tempname = function()
            local path = os.tmpname()
            paths[#paths + 1] = path
            return path
        end,
        runner = runner,
    }
end

local function check_removed(paths)
    for _, path in ipairs(paths) do
        local handle = io.open(path, "rb")
        if handle then handle:close() end
        check.equal(handle, nil, "temporary transport file was not removed")
    end
end

tests[#tests + 1] = { "netcat adapter captures output and cleans all files", function()
    local payload = string.char(0x1B, 0x40, 0x00, 0x5A)
    local seen
    local env = runtime(function(spec)
        seen = spec
        check.equal(read(spec.stdin_path), payload)
        write(spec.stdout_path, string.char(0x3D, 0x0D))
        write(spec.stderr_path, "netcat notice")
        return { ok = true, exit_code = 0 }
    end)
    local result = Netcat.submit(payload, { host = "printer", port = 9100 }, {
        timeout = 5, sudo = false,
    }, env)
    check.equal(result.ok, true)
    check.equal(result.stdout, string.char(0x3D, 0x0D))
    check.equal(result.stderr, "netcat notice")
    check.equal(seen.sudo, false)
    check.equal(table.concat(seen.arguments, " "), "-w 5 printer 9100")
    check.equal(#env.paths, 3)
    check_removed(env.paths)
end }

tests[#tests + 1] = { "netcat adapter marks only local bind-in-use as retryable", function()
    local function attempt(message)
        local env = runtime(function(spec)
            write(spec.stderr_path, message)
            return { ok = false, exit_code = 1 }
        end)
        local result = Netcat.submit("X", { host = "printer", port = 9100 }, {
            timeout = 3, source_port = 1023, sudo = true,
        }, env)
        check_removed(env.paths)
        return result
    end

    local bind = attempt("nc: bind failed: Address already in use\n")
    check.equal(bind.retryable_bind_in_use, true)
    check.equal(bind.source_port, 1023)
    check.equal(bind.exit_code, 1)

    local ambiguous = attempt("remote error: Address already in use\n")
    check.equal(ambiguous.retryable_bind_in_use, false)
end }

tests[#tests + 1] = { "netcat adapter cleans files when its runner throws", function()
    local env = runtime(function()
        error("injected process failure")
    end)
    local result = Netcat.submit("X", { host = "printer", port = 9100 }, {
        timeout = 5, sudo = false,
    }, env)
    check.equal(result.ok, false)
    check.contains(result.stderr, "injected process failure")
    check.equal(result.retryable_bind_in_use, false)
    check_removed(env.paths)
end }

return tests
