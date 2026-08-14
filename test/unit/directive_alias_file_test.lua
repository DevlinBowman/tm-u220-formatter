-- Verifies the declarative alias-file grammar independently of job compilation.
-- This protects user customization without coupling configuration parsing to formatting.
local AliasCatalog = require("tm_u220.job.directive.alias_catalog")
local AliasFile = require("tm_u220.job.directive.alias_file")
local check = require("unit.support")

local tests = {}

local function parse(lines)
    return AliasFile.parse(table.concat(lines, "\n"))
end

tests[#tests + 1] = { "alias files define bare forwarding and sequence mappings", function()
    local document = parse({
        "# local authoring vocabulary",
        "!tm-u220 aliases 1",
        "@bold == @emphasis on",
        "@bold * == @emphasis *",
        "@big-red == @emphasis on | @double-height on | @color red",
    })
    check.equal(#document.diagnostics, 0)
    check.equal(#document.mappings, 3)
    check.equal(document.entries.bold.bare[1][1], "emphasis")
    check.equal(document.entries.bold.bare[1][2], "on")
    check.equal(document.entries.bold.arguments[1][2], "*")
    check.equal(#document.entries["big-red"].bare, 3)
    check.equal(document.entries["big-red"].bare[3][1], "color")
end }

tests[#tests + 1] = { "alias files reject ambiguous or malformed definitions", function()
    local cases = {
        { { "@bold == @emphasis on" }, "alias.header.invalid" },
        { { "!tm-u220 aliases 1", "@lf * == @feed 2" },
            "alias.mapping.invalid_placeholder" },
        { { "!tm-u220 aliases 1", "@red == @color *" },
            "alias.mapping.invalid_placeholder" },
        { { "!tm-u220 aliases 1", "@red == @color red", "@red == @color black" },
            "alias.mapping.duplicate" },
        { { "!tm-u220 aliases 1", "@broken" }, "alias.mapping.invalid" },
    }
    for _, case in ipairs(cases) do
        local document = parse(case[1])
        check.equal(document.diagnostics[1].code, case[2])
    end
end }

tests[#tests + 1] = { "checked-in alias catalog is versioned and complete", function()
    local catalog, failure = AliasCatalog.load()
    check.truthy(catalog, failure and failure.message)
    check.contains(catalog.path, "/config/directives/aliases.u220a")
    for _, name in ipairs({
        "lf", "bold", "left", "center", "right", "cut", "large", "title",
    }) do
        check.truthy(catalog.entries[name], "missing standard alias @" .. name)
    end
end }

tests[#tests + 1] = { "an unreadable alias catalog fails explicitly", function()
    local catalog, failure = AliasCatalog.load(
        "/definitely/missing/tm-u220-aliases.u220a"
    )
    check.equal(catalog, nil)
    check.equal(failure.code, "job.directive.alias_config_read_failed")
    check.contains(failure.message, "cannot read")
end }

return tests
