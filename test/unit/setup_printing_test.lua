-- Verifies that setup delegates only to the fixed unprivileged review workflow.
local check = require("unit.support")
local setup = require("tm_u220.app.setup_printing")

local tests = {}

tests[#tests + 1] = { "printing setup launches only the fixed unprivileged helper", function()
    local spec = setup.launch_spec({ host = "192.168.50.41",
        profile_path = "printer.u220p" })
    check.equal(spec.executable, "node")
    check.equal(#spec.arguments, 5)
    check.contains(spec.arguments[1], "/libexec/tm-u220-setup-printing.mjs")
    check.equal(spec.arguments[2], "--host")
    check.equal(spec.arguments[3], "192.168.50.41")
    check.equal(spec.arguments[4], "--profile")
    check.equal(spec.arguments[5], "printer.u220p")
    check.equal(spec.display_name, "TM-U220 Printing Setup")
end }

tests[#tests + 1] = { "printing setup preserves structured runner success", function()
    local received
    local status, message = setup.run({}, {
        runner = function(spec)
            received = spec
            return { ok = true, exit_code = 0 }
        end,
    })
    check.equal(status, 0)
    check.equal(message, nil)
    check.equal(received.executable, "node")
end }

tests[#tests + 1] = { "printing setup fails closed on runner errors", function()
    local status, message = setup.run({}, {
        runner = function() return { ok = false, exit_code = 7 } end,
    })
    check.equal(status, 7)
    check.equal(message, nil)

    status, message = setup.run({}, { runner = function() return "bad" end })
    check.equal(status, 1)
    check.contains(message, "invalid result")

    status, message = setup.run({}, {
        runner = function() return { ok = false, exit_code = 64 } end,
    })
    check.equal(status, 2)
    check.equal(message, nil)
end }

return tests
