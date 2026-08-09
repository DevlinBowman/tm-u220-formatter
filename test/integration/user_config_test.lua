-- Exercises user-selected alias and profile files through application compilation.
-- Writable authoring configuration must affect output rather than merely be discoverable.
local check = require("unit.support")
local JobService = require("tm_u220.app.job_service")

local tests = {}

local function write(path, source)
    local handle = assert(io.open(path, "wb"))
    assert(handle:write(source))
    assert(handle:close())
end

local function with_configuration(body)
    local aliases = os.tmpname() .. ".u220a"
    local profile = os.tmpname() .. ".u220p"
    write(aliases, table.concat({
        "!tm-u220 aliases 1",
        "@custom-heading == @align center | @color red",
        "",
    }, "\n"))
    write(profile, table.concat({
        "!tm-u220 profile 1",
        "variant=D",
        "paper=57.5",
        "dip2_1=on",
        "cutter=none",
        "",
    }, "\n"))

    local ok, failure = xpcall(function() body(aliases, profile) end, debug.traceback)
    os.remove(aliases)
    os.remove(profile)
    if not ok then error(failure, 0) end
end

tests[#tests + 1] = { "job service applies selected aliases and saved profile", function()
    with_configuration(function(aliases, profile)
        local result = JobService.compile_content(
            "@custom-heading | @text CONFIGURED | @line", {
                alias_path = aliases,
                profile_path = profile,
            })

        check.equal(#result.diagnostics, 0)
        check.equal(result.profile.variant, "d")
        check.equal(result.profile.paper_id, "57.5mm")
        check.equal(result.preview_lines[1].justification, "center")
        check.equal(result.preview_lines[1].segments[1].style.color, "red")
    end)
end }

return tests
