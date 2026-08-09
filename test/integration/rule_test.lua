-- Verifies that @rule patterns fill one printer line using Unicode scalar cells.
-- These tests keep pattern parsing and rule-specific layout boundaries together.
local check = require("unit.support")
local compiler = require("tm_u220.app.job_compiler")
local job = require("tm_u220.job.init")

local tests = {}

local function profile()
    return {
        variant = "B", paper = 76, dip2_1 = false, cutter = "partial",
    }
end

local function compile_source(lines)
    local document = job.parse(table.concat(lines, "\n"))
    return document, compiler.compile(document, { profile = profile() })
end

local function has_diagnostic(result, code)
    for _, item in ipairs(result.diagnostics or {}) do
        if item.code == code then return true end
    end
    return false
end

tests[#tests + 1] = { "single and multi-glyph rules fill the current line", function()
    local document, result = compile_source({
        "!tm-u220 job 1",
        "@font a",
        "@rule -",
        "@rule -+",
        "@rule é+",
        "@rule |+",
    })
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[2].pattern, "-")
    check.equal(document.ops[3].pattern, "-+")
    check.equal(document.ops[4].pattern, "é+")
    check.equal(document.ops[5].pattern, "|+")
    check.equal(#result.diagnostics, 0)

    local expected = {
        ("-"):rep(33),
        ("-+"):rep(16) .. "-",
        ("é+"):rep(16) .. "é",
        ("|+"):rep(16) .. "|",
    }
    check.equal(#result.preview_lines, #expected)
    for index, text in ipairs(expected) do
        local line = result.preview_lines[index]
        check.equal(line.text, text)
        check.equal(line.content_width_half_dots, 396)
        check.equal(line.reason, "rule")
    end
end }

tests[#tests + 1] = { "a rule pattern wider than the line clips without wrapping", function()
    local pattern = ("1234567890"):rep(4)
    local _, result = compile_source({
        "!tm-u220 job 1",
        "@font a",
        "@rule " .. pattern,
    })
    check.equal(#result.diagnostics, 0)
    check.equal(#result.preview_lines, 1)
    check.equal(result.preview_lines[1].text, pattern:sub(1, 33))
    check.equal(result.preview_lines[1].reason, "rule")
end }

tests[#tests + 1] = { "rule patterns must contain printable glyphs", function()
    for _, directive in ipairs({ "@rule", "@rule   ", "\t@rule\t\t" }) do
        local document = job.parse("!tm-u220 job 1\n" .. directive)
        check.equal(#document.ops, 0)
        check.truthy(has_diagnostic(document, "job.directive.invalid_arguments"))
    end

    local _, result = compile_source({
        "!tm-u220 job 1",
        "@rule -\1",
    })
    check.truthy(has_diagnostic(result, "FORMAT_UNSUPPORTED_CHARACTER"))
    check.equal(#result.preview_lines, 0)
end }

tests[#tests + 1] = { "impossible rule width fails instead of printing an empty rule", function()
    local document = {
        version = 1,
        profile = {},
        diagnostics = {},
        ops = {
            { kind = "spacing", value = 255 },
            { kind = "double_width", enabled = true },
            { kind = "rule", pattern = "-" },
        },
    }
    local result = compiler.compile(document, { profile = profile() })
    check.truthy(has_diagnostic(result, "FORMAT_CHARACTER_TOO_WIDE"))
    check.equal(#result.preview_lines, 0)
end }

return tests
