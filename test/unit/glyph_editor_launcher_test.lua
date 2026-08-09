-- Verifies the developer glyph editor launches only the fixed checkout command.
-- Managed releases and incomplete checkouts fail before any process is started.
local check = require("unit.support")
local Launcher = require("tm_u220.app.glyph_editor_launcher")

local tests = {}

tests[#tests + 1] = { "glyph editor launcher uses the fixed checkout executable", function()
    local spec = Launcher.launch_spec({ project_root = "/work/tm-u220" })
    check.equal(spec.executable, "/work/tm-u220/dev/glyphs")
    check.equal(#spec.arguments, 0)
    check.equal(spec.display_name, "TM-U220 glyph editor")
end }

tests[#tests + 1] = { "glyph editor launcher preserves checkout process status", function()
    local received, checked
    local status, message = Launcher.run({
        project_root = "/work/tm-u220",
        managed_release = false,
        exists = function(path)
            checked = path
            return true
        end,
        runner = function(spec)
            received = spec
            return { ok = false, exit_code = 7 }
        end,
    })
    check.equal(status, 7)
    check.equal(message, nil)
    check.equal(checked, "/work/tm-u220/dev/glyphs")
    check.equal(received.executable, "/work/tm-u220/dev/glyphs")
end }

tests[#tests + 1] = { "glyph editor launcher rejects managed releases before execution", function()
    local executed = false
    local status, message = Launcher.run({
        project_root = "/release",
        managed_release = true,
        runner = function() executed = true end,
    })
    check.equal(status, 1)
    check.contains(message, "available only from a source checkout")
    check.equal(executed, false)
end }

tests[#tests + 1] = { "glyph editor launcher rejects an incomplete checkout", function()
    local executed = false
    local status, message = Launcher.run({
        project_root = "/work/tm-u220",
        managed_release = false,
        exists = function() return false end,
        runner = function() executed = true end,
    })
    check.equal(status, 1)
    check.contains(message, "glyph editor launcher is unavailable")
    check.equal(executed, false)
end }

tests[#tests + 1] = { "glyph editor launcher rejects malformed process results", function()
    local status, message = Launcher.run({
        project_root = "/work/tm-u220",
        managed_release = false,
        exists = function() return true end,
        runner = function() return "invalid" end,
    })
    check.equal(status, 1)
    check.contains(message, "returned an invalid result")
end }

return tests
