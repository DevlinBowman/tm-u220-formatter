-- Verifies native job parsing and profile-aware compilation behavior.
local check = require("unit.support")
local compiler = require("tm_u220.app.job_service")
local defaults = require("tm_u220.app.local_defaults")
local job = require("tm_u220.job")

local tests = {}

local function has_code(document, code)
    for _, item in ipairs(document.diagnostics or {}) do
        if item.code == code then return true end
    end
    return false
end

tests[#tests + 1] = { "Type D job profiles accept no cutter", function()
    local document = job.parse(table.concat({
        "!tm-u220 job 1",
        "@profile variant=D paper=57.5 dip2_1=off cutter=none",
        "Hello",
    }, "\n"))
    check.equal(#document.diagnostics, 0)
    check.equal(document.profile.variant, "D")
    check.equal(document.profile.cutter, "none")
end }

tests[#tests + 1] = { "lowercase job profile variant canonicalizes and matches local profile", function()
    local source = table.concat({
        "!tm-u220 job 1",
        "@profile variant=b paper=76 dip2_1=off cutter=partial",
        "Hello",
    }, "\n")
    local document = job.parse(source)
    check.equal(#document.diagnostics, 0)
    check.equal(document.profile.variant, "B")

    local result = compiler.compile_source(source, {
        profile_path = defaults.profile_path(),
    })
    check.equal(#result.diagnostics, 0)
    check.truthy(result.bytes)
    check.equal(result.profile.variant, "b")
    check.equal(result.preview_lines[1].text, "Hello")
end }

tests[#tests + 1] = { "cut directive values are case insensitive and canonicalized", function()
    local document = job.parse(table.concat({
        "!tm-u220 job 1",
        "@cut InStAlLeD",
        "@cut PaRtIaL feed=2",
    }, "\n"))
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].kind, "cut")
    check.equal(document.ops[1].mode, "installed")
    check.equal(document.ops[2].kind, "cut")
    check.equal(document.ops[2].mode, "partial")
    check.equal(document.ops[2].feed, 2)
end }

tests[#tests + 1] = { "upside-down accepts only explicit on and off values", function()
    local document = job.parse(table.concat({
        "!tm-u220 job 1", "@upside-down on", "@upside-down off",
    }, "\n"))
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].kind, "upside_down")
    check.equal(document.ops[1].enabled, true)
    check.equal(document.ops[2].enabled, false)

    document = job.parse("!tm-u220 job 1\n@upside-down sideways")
    check.truthy(has_code(document, "job.directive.invalid_arguments"))
end }

return tests
