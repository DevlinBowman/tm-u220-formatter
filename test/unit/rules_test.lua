-- Verifies that built-in rules remain complete, readable, and CLI-accessible.
local check = require("unit.support")
local AliasCatalog = require("tm_u220.job.directive.alias_catalog")
local cli = require("tm_u220.cli.run")
local Directive = require("tm_u220.job.directive")
local rules = require("tm_u220.render.rules")

local tests = {}

local function test(name, body)
    tests[#tests + 1] = { name, body }
end

local function assert_terminal_text(value)
    check.truthy(type(value) == "string" and value ~= "")
    check.equal(value:sub(-1), "\n", "rules output must end with a newline")
    check.falsy(value:find(string.char(27), 1, true),
        "rules output must not contain terminal escape sequences")
    check.falsy(value:find("[ \t]+\n"),
        "rules output must not contain trailing whitespace")
    for line in value:gmatch("([^\n]*)\n") do
        check.truthy(#line <= 88, "rules output line is wider than 88 columns")
    end
end

test("rules index lists topics and quick examples", function()
    local value, err = rules.render()
    check.truthy(value, err)
    assert_terminal_text(value)
    check.contains(value, "220 rules <topic>")
    for _, topic in ipairs({
        "document", "job", "directives", "profile", "examples",
    }) do
        check.contains(value, topic)
    end
    check.contains(value, "220 print")
    check.contains(value, "220 render")
    check.contains(value, "220 directives")
end)

test("rules topics explain the actual authoring contracts", function()
    local expected = {
        document = {
            "ordinary", "quoted text", "--text", "--ftext",
            "existing file", "Unicode",
        },
        job = { ".u220", "!tm-u220 job 1", "strict" },
        directives = {
            "@align", "@upside-down", "@font a | @emphasis on",
            "@rule PATTERN", "@kv", "@table [TABLE_ALIGN,]COLUMN", "@end-table",
            "@cut installed", "@lf N", "aliases.u220a",
        },
        profile = { "config/printers/local.u220p", "--profile" },
        examples = { "220 check", "220 render", "220 compile", "220 print" },
    }

    for topic, fragments in pairs(expected) do
        local value, err = rules.render(topic)
        check.truthy(value, err)
        assert_terminal_text(value)
        for _, fragment in ipairs(fragments) do check.contains(value, fragment) end
    end
end)

test("directives rules lead with native controls and keep aliases inline", function()
    local value = assert(rules.render("directives"))
    local native = assert(value:find(
        "Printer-native and job-system directives:", 1, true))
    local utilities = assert(value:find("Formatter-defined utilities:", 1, true))
    check.truthy(native < utilities)

    for _, fragment in ipairs({
        "@left/@center/@right", "@bold -> on", "@normal-size off/off",
        "@underline/@ul -> single", "@lf N -> @feed N",
        "bare @cut -> @cut installed",
    }) do
        local position = assert(value:find(fragment, 1, true))
        check.truthy(position < utilities, fragment .. " must stay beside native controls")
    end

    check.truthy(assert(value:find("@rule PATTERN", 1, true)) > utilities)
    check.truthy(assert(value:find("@fi", 1, true)) > utilities)
    check.falsy(value:find("Standard configured aliases:", 1, true))
    check.contains(value, "config/directives/aliases.u220a")
end)

test("directives rules describe the current table grammar", function()
    local value = assert(rules.render("directives"))
    for _, fragment in ipairs({
        "@table [TABLE_ALIGN,]COLUMN[,COLUMN...]",
        "TABLE_ALIGN = L or R; default L",
        "COLUMN = WIDTH[CONTENT_ALIGN[GROUP]]",
        "CONTENT_ALIGN = L, C, or R; default L",
        "GROUP = L or R; default TABLE_ALIGN",
        "Use 4LR for left-aligned content explicitly",
        "one pipe-separated field per declared column",
    }) do
        check.contains(value, fragment)
    end
end)

test("compact directive reference reuses the ordered valid-directive list", function()
    local value = rules.directive_list()
    check.contains(value, "220 directives - Valid job directives")
    local native = assert(value:find("Printer-native and job-system directives:", 1, true))
    local utilities = assert(value:find("Formatter-defined utilities:", 1, true))
    check.truthy(native < utilities)
    check.contains(value, "@table [TABLE_ALIGN,]COLUMN[,COLUMN...]")
    check.contains(value, "@lf N -> @feed N")
    check.contains(value, "Run 220 config to edit the active aliases")
    check.contains(value, "config/directives/aliases.u220a")
    local shipped = assert(AliasCatalog.load())
    for name in pairs(shipped.entries) do
        check.contains(value, "@" .. name)
    end
    for _, name in ipairs(Directive.canonical_names()) do
        check.contains(value, "@" .. name)
    end
    check.falsy(value:find("A COLUMN's first suffix", 1, true))
end)

test("unknown rules topics return actionable guidance", function()
    local value, err = rules.render("definitely-unknown")
    check.equal(value, nil)
    check.contains(err, "unknown rules topic")
    check.contains(err, "definitely-unknown")
    check.contains(err, "220 rules")
end)

test("rules topic is browsable through the CLI", function()
    local output = {}
    local status = cli.main({ "rules", "directives" }, {
        write = function(...)
            for index = 1, select("#", ...) do
                output[#output + 1] = tostring(select(index, ...))
            end
        end,
    })
    check.equal(status, 0)
    local value = table.concat(output)
    check.contains(value, "@emphasis on|off")
    check.contains(value, "220 rules")
end)

return tests
