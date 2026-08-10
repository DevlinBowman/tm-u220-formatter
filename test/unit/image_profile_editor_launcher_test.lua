-- Verifies the public image-profile launcher invokes only its fixed editor helper and printer profile.
-- Helper process failures retain the shared public exit-status contract.
local check = require("unit.support")
local Launcher = require("tm_u220.app.image_profile_editor_launcher")

local tests = {}

tests[#tests + 1] = { "image profile editor launcher has a fixed process contract", function()
    local spec = Launcher.launch_spec("art/photo.jpg", {
        profile_path = "/profiles/local.u220p",
    })
    check.equal(spec.executable, "node")
    check.contains(spec.arguments[1], "/libexec/image_profile_editor/main.mjs")
    check.equal(spec.arguments[2], "art/photo.jpg")
    check.equal(spec.arguments[3], "--profile")
    check.equal(spec.arguments[4], "/profiles/local.u220p")
    check.equal(#spec.arguments, 4)
    check.equal(spec.display_name, "TM-U220 image profile editor")
end }

tests[#tests + 1] = { "image profile editor launcher preserves helper status", function()
    local received
    local status, message = Launcher.run("Chicken.png", {
        profile_path = "/profiles/local.u220p",
    }, {
        runner = function(spec)
            received = spec
            return { ok = false, exit_code = 7 }
        end,
    })
    check.equal(status, 7)
    check.equal(message, nil)
    check.equal(received.arguments[2], "Chicken.png")
end }

tests[#tests + 1] = { "leading-dash image names remain positional", function()
    local spec = Launcher.launch_spec("-photo.jpg", {
        profile_path = "/profiles/local.u220p",
    })
    check.equal(spec.arguments[2], "./-photo.jpg")
end }

tests[#tests + 1] = { "image profile editor launcher rejects malformed results", function()
    local status, message = Launcher.run("Chicken.png", {
        profile_path = "/profiles/local.u220p",
    }, { runner = function() return "invalid" end })
    check.equal(status, 1)
    check.contains(message, "returned an invalid result")
end }

return tests
