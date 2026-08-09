-- Verifies whitespace tolerance without weakening native directive grammar.
local check = require("unit.support")
local job = require("tm_u220.job")

local tests = {}

local function parse_lines(lines)
    table.insert(lines, 1, "!tm-u220 job 1")
    return job.parse(table.concat(lines, "\n"))
end

local function has_code(document, code)
    for _, item in ipairs(document.diagnostics or {}) do
        if item.code == code then return true end
    end
    return false
end

tests[#tests + 1] = { "scalar directives ignore structural horizontal whitespace", function()
    local document = parse_lines({
        " \t@profile  variant = b\t paper = 76 dip2_1 = off cutter = partial \t",
        "\t@align\t  center \t",
        "  @emphasis    on   ",
        " @spacing\t 7 ",
        "  @line    ",
        "\t@fi\t",
    })
    check.equal(#document.diagnostics, 0)
    check.equal(document.profile.variant, "B")
    check.equal(document.ops[1].kind, "align")
    check.equal(document.ops[1].value, "center")
    check.equal(document.ops[2].kind, "emphasis")
    check.equal(document.ops[2].enabled, true)
    check.equal(document.ops[3].value, 7)
    check.equal(document.ops[4].kind, "line")
    check.equal(document.ops[5].kind, "finish")
end }

tests[#tests + 1] = { "structured directives accept padded syntax", function()
    local document = parse_lines({
        "  @kv    LEFT   |   RIGHT  ",
        "\t@rule\t  -+  ",
        " @cut   PaRtIaL   feed = 2 \t",
    })
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].left, "LEFT")
    check.equal(document.ops[1].right, "RIGHT")
    check.equal(document.ops[2].pattern, "-+")
    check.equal(document.ops[3].mode, "partial")
    check.equal(document.ops[3].feed, 2)
end }

tests[#tests + 1] = { "literal text spacing and indented escapes are preserved", function()
    local document = parse_lines({
        "  @@align center",
        "@text   padded  ",
    })
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].text, "  @align center")
    check.equal(document.ops[2].text, "  padded  ")
end }

tests[#tests + 1] = { "directive sequences ignore separator padding", function()
    local document = parse_lines({
        "  @font  a|@emphasis on |   @line-spacing\tdefault  ",
    })
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].kind, "font")
    check.equal(document.ops[2].kind, "emphasis")
    check.equal(document.ops[3].kind, "line_spacing")

    document = parse_lines({ "@text A|   @line" })
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].text, "A")
    check.equal(document.ops[2].kind, "line")

    document = parse_lines({ "@text A\\|   @font b" })
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].text, "A|   @font b")
end }

tests[#tests + 1] = { "non-whitespace syntax remains invalid", function()
    local cases = {
        { "@align center extra", "job.directive.invalid_arguments" },
        { " @init extra", "job.directive.invalid_arguments" },
        { "\t@font:a", "job.directive.invalid_syntax" },
        { "  @not-real on", "job.directive.unknown" },
    }
    for _, case in ipairs(cases) do
        local document = parse_lines({ case[1] })
        check.truthy(has_code(document, case[2]), case[1])
    end
end }

return tests
