-- Verifies configuration editing delegates only to its fixed unprivileged helper process.
-- The application boundary preserves public status codes without owning filesystem or Vim behavior.
local check = require("unit.support")
local Editor = require("tm_u220.app.config_editor")

local tests = {}

tests[#tests + 1] = { "configuration editor launches only the fixed helper", function()
    local spec = Editor.launch_spec()
    check.equal(spec.executable, "node")
    check.contains(spec.arguments[1], "/libexec/tm-u220-config.mjs")
    check.equal(#spec.arguments, 1)
    check.equal(spec.display_name, "TM-U220 Configuration")
end }

tests[#tests + 1] = { "configuration editor preserves helper status", function()
    local received
    local status, message = Editor.run({
        runner = function(spec)
            received = spec
            return { ok = false, exit_code = 7 }
        end,
    })
    check.equal(status, 7)
    check.equal(message, nil)
    check.equal(received.display_name, "TM-U220 Configuration")
end }

tests[#tests + 1] = { "configuration editor validates files only after Vim succeeds", function()
    local validated = false
    local status, failure = Editor.run({
        runner = function() return { ok = true, exit_code = 0 } end,
        validate_configuration = function()
            validated = true
            return nil, "directive aliases are invalid"
        end,
    })
    check.equal(status, 1)
    check.equal(failure, "directive aliases are invalid")
    check.equal(validated, true)

    validated = false
    status = Editor.run({
        runner = function() return { ok = false, exit_code = 130 } end,
        validate_configuration = function() validated = true return {} end,
    })
    check.equal(status, 130)
    check.equal(validated, false)
end }

tests[#tests + 1] = { "configuration editor rejects malformed helper results", function()
    local status, failure = Editor.run({ runner = function() return "invalid" end })
    check.equal(status, 1)
    check.contains(failure, "invalid result")
end }

return tests
