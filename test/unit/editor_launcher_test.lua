-- Verifies editor process construction and parsing-mode propagation.
local check = require("unit.support")
local launcher = require("tm_u220.app.editor_launcher")

local tests = {}

tests[#tests + 1] = { "editor launcher quotes paths and carries editor options", function()
    local command = launcher.command("receipt's draft.u220", {
        alias_path = "config/directive aliases.u220a",
        string_input = "raw",
        profile_path = "profiles/local printer.u220p",
        image_profile_path = "profiles/image defaults.u220i",
    })
    check.contains(command, "web/server/main.mjs")
    check.contains(command, "'receipt'\\''s draft.u220'")
    check.contains(command, "--text")
    check.contains(command, "--aliases 'config/directive aliases.u220a'")
    check.contains(command, "'profiles/local printer.u220p'")
    check.contains(command, "--image-profile 'profiles/image defaults.u220i'")
end }

tests[#tests + 1] = { "editor launcher returns the child process status", function()
    local command
    local status = launcher.run("receipt.u220", {}, {
        execute = function(value)
            command = value
            return nil, "exit", 7
        end,
    })
    check.equal(status, 7)
    check.contains(command, "receipt.u220")
end }

return tests
