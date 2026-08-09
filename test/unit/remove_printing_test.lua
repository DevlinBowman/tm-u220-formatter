-- Verifies that removal delegates to the fixed helper and forwards mutation only when explicit.
-- The tests inject the runner and never inspect or modify machine policy.
local check = require("unit.support")
local Removal = require("tm_u220.app.remove_printing")

local tests = {}

tests[#tests + 1] = { "printing removal is dry-run unless remove is explicit", function()
    local dry = Removal.launch_spec({})
    check.equal(dry.executable, "node")
    check.contains(dry.arguments[1], "/libexec/tm-u220-remove-printing.mjs")
    check.equal(#dry.arguments, 1)

    local mutating = Removal.launch_spec({ remove = true, json = true })
    check.equal(mutating.arguments[2], "--remove")
    check.equal(mutating.arguments[3], "--json")
end }

tests[#tests + 1] = { "printing removal preserves helper exit status", function()
    local received
    local status, message = Removal.run({ remove = true }, {
        runner = function(spec)
            received = spec
            return { ok = false, exit_code = 1 }
        end,
    })
    check.equal(status, 1)
    check.equal(message, nil)
    check.equal(received.arguments[2], "--remove")

    status, message = Removal.run({}, { runner = function() return "invalid" end })
    check.equal(status, 1)
    check.contains(message, "invalid result")

    status, message = Removal.run({}, {
        runner = function() return { ok = false, exit_code = 64 } end,
    })
    check.equal(status, 2)
    check.equal(message, nil)
end }

return tests
