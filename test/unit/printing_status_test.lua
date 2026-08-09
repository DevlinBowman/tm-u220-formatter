-- Verifies that printing status delegates to the read-only helper with explicit device scope.
local check = require("unit.support")
local Status = require("tm_u220.app.printing_status")

local tests = {}

tests[#tests + 1] = { "printing status forwards only inspection flags", function()
    local spec = Status.launch_spec({ json = true, check_device = true })
    check.equal(spec.executable, "node")
    check.contains(spec.arguments[1], "/libexec/tm-u220-printing-status.mjs")
    check.equal(spec.arguments[2], "--json")
    check.equal(spec.arguments[3], "--check-device")
end }

tests[#tests + 1] = { "printing status preserves helper health exit codes", function()
    local status = Status.run({}, {
        runner = function() return { ok = true, exit_code = 0 } end,
    })
    check.equal(status, 0)
    local message
    status, message = Status.run({ json = true }, {
        runner = function() return { ok = false, exit_code = 3 } end,
    })
    check.equal(status, 3)
    check.contains(message, "unhealthy or incomplete")

    status, message = Status.run({}, {
        runner = function() return { ok = false, exit_code = 64 } end,
    })
    check.equal(status, 2)
    check.contains(message, "unhealthy or incomplete")
end }

return tests
