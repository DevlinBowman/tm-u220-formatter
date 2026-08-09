-- Verifies the shared app helper boundary preserves command rendering and injected execution.
-- It also owns the one public exit normalization shared by printing administration commands.
local check = require("unit.support")
local HelperProcess = require("tm_u220.app.helper_process")

local tests = {}

tests[#tests + 1] = { "helper process builds the fixed Node command contract", function()
    local spec = HelperProcess.launch_spec("sample-helper.mjs", "Sample Helper",
        { "--name", "O'Brien" })
    check.equal(spec.executable, "node")
    check.contains(spec.arguments[1], "/libexec/sample-helper.mjs")
    check.equal(spec.arguments[2], "--name")
    check.equal(spec.arguments[3], "O'Brien")
    check.equal(spec.display_name, "Sample Helper")
    check.equal(HelperProcess.command({
        executable = "node",
        arguments = { "/tmp/helper path.mjs", "--name", "O'Brien" },
    }), "'node' '/tmp/helper path.mjs' '--name' 'O'\\''Brien'")
end }

tests[#tests + 1] = { "helper process preserves runner injection and operational exits", function()
    local spec = HelperProcess.launch_spec("sample-helper.mjs", "Sample Helper")
    local received
    local result = HelperProcess.run(spec, { runner = function(value)
        received = value
        return { ok = false, exit_code = 7 }
    end })
    check.equal(received, spec)
    check.equal(HelperProcess.exit_code(result), 7)
    check.equal(HelperProcess.exit_code({ ok = false }), 1)
    check.equal(HelperProcess.exit_code({ ok = true, exit_code = 9 }), 0)
end }

tests[#tests + 1] = { "helper usage exits normalize to the public usage status", function()
    local result = { ok = false, exit_code = 64 }
    check.equal(HelperProcess.exit_code(result), 2)
end }

tests[#tests + 1] = { "helper process rejects malformed runner results", function()
    local spec = HelperProcess.launch_spec("sample-helper.mjs", "Sample Helper")
    local result = HelperProcess.run(spec, { runner = function() return "invalid" end })
    check.equal(result, nil)
end }

return tests
