-- Proves concise style aliases retain canonical parsing and compiled behavior.
local check = require("unit.support")
local AliasFile = require("tm_u220.job.directive.alias_file")
local job = require("tm_u220.job")
local job_service = require("tm_u220.app.job_service")

local tests = {}

local function profile()
    return {
        variant = "B", paper = 76, dip2_1 = false, cutter = "partial",
    }
end

local function source(lines)
    table.insert(lines, 1, "!tm-u220 job 1")
    return table.concat(lines, "\n")
end

local function has_code(document, code)
    for _, item in ipairs(document.diagnostics or {}) do
        if item.code == code then return true end
    end
    return false
end

tests[#tests + 1] = { "style aliases normalize to canonical operations", function()
    local document = job.parse(source({
        "@red | @black | @font-a | @font-b | @underline | @ul",
        "@underline-double | @ul-double | @underline-off | @ul-off",
    }))
    check.equal(#document.diagnostics, 0)

    local expected = {
        { "color", "red" }, { "color", "black" },
        { "font", "a" }, { "font", "b" },
        { "underline", "single" }, { "underline", "single" },
        { "underline", "double" }, { "underline", "double" },
        { "underline", "off" }, { "underline", "off" },
    }
    check.equal(#document.ops, #expected)
    for index, item in ipairs(expected) do
        check.equal(document.ops[index].kind, item[1])
        check.equal(document.ops[index].value, item[2])
    end
end }

tests[#tests + 1] = { "size aliases expand to absolute canonical presets", function()
    local document = job.parse(source({
        "@normal-size | @wide | @tall | @large",
    }))
    check.equal(#document.diagnostics, 0)

    local expected = {
        { "double_width", false }, { "double_height", false },
        { "double_width", true }, { "double_height", false },
        { "double_width", false }, { "double_height", true },
        { "double_width", true }, { "double_height", true },
    }
    check.equal(#document.ops, #expected)
    for index, item in ipairs(expected) do
        check.equal(document.ops[index].kind, item[1])
        check.equal(document.ops[index].enabled, item[2])
    end
end }

tests[#tests + 1] = { "bare cut selects the installed cutter", function()
    local document = job.parse(source({ "@cut" }))
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].kind, "cut")
    check.equal(document.ops[1].mode, "installed")

    document = job.parse(source({ "@cut partial" }))
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].mode, "partial")
end }

tests[#tests + 1] = { "forwarding and alignment aliases stay canonical", function()
    local document = job.parse(source({
        "@lf 3 | @bold | @left | @bold off | @center | @right",
    }))
    check.equal(#document.diagnostics, 0)
    local expected = {
        { "feed", "value", 3 },
        { "emphasis", "enabled", true },
        { "align", "value", "left" },
        { "emphasis", "enabled", false },
        { "align", "value", "center" },
        { "align", "value", "right" },
    }
    for index, item in ipairs(expected) do
        check.equal(document.ops[index].kind, item[1])
        check.equal(document.ops[index][item[2]], item[3])
    end
end }

tests[#tests + 1] = { "user aliases expand only through canonical targets", function()
    local configured = AliasFile.parse(table.concat({
        "!tm-u220 aliases 1",
        "@big-red == @emphasis on | @double-height on | @color red",
        "@skip * == @feed *",
    }, "\n"))
    check.equal(#configured.diagnostics, 0)

    local document = job.parse(source({ "@big-red | @skip 2" }), {
        aliases = configured.entries,
    })
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].kind, "emphasis")
    check.equal(document.ops[2].kind, "double_height")
    check.equal(document.ops[3].kind, "color")
    check.equal(document.ops[3].value, "red")
    check.equal(document.ops[4].kind, "feed")
    check.equal(document.ops[4].value, 2)

    configured = AliasFile.parse(table.concat({
        "!tm-u220 aliases 1",
        "@first == @second",
        "@second == @color red",
    }, "\n"))
    document = job.parse(source({ "@first" }), {
        aliases = configured.entries,
    })
    check.truthy(has_code(document, "job.directive.unknown"))
end }

tests[#tests + 1] = { "aliases compile to canonical bytes", function()
    local concise = source({
        "@left | @font-a | @red | @ul | @bold | @large", "ALIASED",
        "@font-b | @black | @ul-off | @wide", "PLAIN",
        "@lf 2",
        "@cut",
    })
    local canonical = source({
        "@align left | @font a | @color red | @underline single "
            .. "| @emphasis on "
            .. "| @double-width on | @double-height on", "ALIASED",
        "@font b | @color black | @underline off "
            .. "| @double-width on | @double-height off", "PLAIN",
        "@feed 2",
        "@cut installed",
    })
    local concise_result = job_service.compile_source(concise, {
        profile = profile(),
    })
    local canonical_result = job_service.compile_source(canonical, {
        profile = profile(),
    })
    check.equal(#concise_result.diagnostics, 0)
    check.equal(#canonical_result.diagnostics, 0)
    check.equal(concise_result.bytes, canonical_result.bytes)
end }

tests[#tests + 1] = { "fixed aliases reject arguments", function()
    for _, directive in ipairs({
        "@red dark", "@font-a b", "@ul single", "@ul-off now",
        "@underline-double double", "@large huge", "@normal-size now", "@lf",
    }) do
        local document = job.parse(source({ directive }))
        check.equal(#document.ops, 0, directive)
        check.truthy(has_code(document, "job.directive.invalid_arguments"), directive)
    end

    local canonical = job.parse(source({ "@underline double" }))
    check.equal(#canonical.diagnostics, 0)
    check.equal(canonical.ops[1].value, "double")

    canonical = job.parse(source({ "@cut full" }))
    check.equal(#canonical.diagnostics, 0)
    check.equal(canonical.ops[1].mode, "full")
end }

return tests
