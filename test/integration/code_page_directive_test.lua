-- Proves authored code-page locks select public standard tables for one printer line only.
-- Exact byte assertions cover duplicate glyphs plus every boundary that releases a lock.
local check = require("unit.support")
local compiler = require("tm_u220.app.job_compiler")
local job = require("tm_u220.job.init")
local job_service = require("tm_u220.app.job_service")

local tests = {}

local function profile()
    return {
        variant = "B", paper = 76, dip2_1 = false, cutter = "partial",
    }
end

local function has_diagnostic(result, code)
    for _, item in ipairs(result.diagnostics or {}) do
        if item.code == code then return item end
    end
end

local function source(lines)
    table.insert(lines, 1, "!tm-u220 job 1")
    return table.concat(lines, "\n")
end

tests[#tests + 1] = { "code-page parser admits only mapped catalog integers", function()
    local parsed = job.parse(source({ "@code-page 2" }))
    check.equal(#parsed.diagnostics, 0)
    check.equal(parsed.ops[1].kind, "code_page")
    check.equal(parsed.ops[1].value, 2)

    for _, value in ipairs({ "9", "20", "1.5", "256" }) do
        parsed = job.parse(source({ "@code-page " .. value }))
        local failure = has_diagnostic(parsed, "job.directive.invalid_arguments")
        check.truthy(failure, value)
        check.contains(failure.message, "public standard-page catalog")
    end
end }

tests[#tests + 1] = { "page lock resolves duplicate glyph then line restores page zero", function()
    local result = job_service.compile_source(source({
        "@code-page 2 | @text ¢ | @line",
        "@text ¢ | @line",
    }), { profile = profile() })

    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text, "¢")
    check.equal(result.preview_lines[1].segments[1].code_page, 2)
    check.equal(result.preview_lines[2].segments[1].code_page, 0)
    check.equal(result.bytes, check.bytes(
        "1B 40 1B 74 02 BD 1B 74 00 0A 9B 0A"))
end }

tests[#tests + 1] = { "explicit page zero still emits its ESC t selection", function()
    local result = job_service.compile_source(source({
        "@code-page 0 | @text / | @line",
    }), { profile = profile() })

    check.equal(#result.diagnostics, 0)
    check.equal(result.bytes, check.bytes("1B 40 1B 74 00 2F 0A"))
end }

tests[#tests + 1] = { "automatic wrapping releases a one-line page lock", function()
    local result = job_service.compile_source(source({
        "@code-page 2",
        "@text " .. ("¢"):rep(41),
    }), { profile = profile() })

    check.equal(#result.diagnostics, 0)
    check.equal(#result.preview_lines, 2)
    check.equal(result.preview_lines[1].text, ("¢"):rep(40))
    check.equal(result.preview_lines[2].text, "¢")
    check.equal(result.preview_lines[1].segments[1].code_page, 2)
    check.equal(result.preview_lines[2].segments[1].code_page, 0)
    check.equal(result.bytes,
        check.bytes("1B 40 1B 74 02") .. string.char(0xBD):rep(40)
            .. check.bytes("1B 74 00 0A 9B 0A"))
end }

tests[#tests + 1] = { "motion cut and reset each release a page lock", function()
    local cases = {
        {
            directive = "@feed 1",
            bytes = "1B 40 1B 74 02 1B 74 00 1B 64 01 9B 0A",
        },
        {
            directive = "@cut installed",
            bytes = "1B 40 1B 74 02 1B 74 00 1D 56 42 00 9B 0A",
        },
        {
            directive = "@init",
            bytes = "1B 40 1B 74 02 1B 40 9B 0A",
        },
    }

    for _, case in ipairs(cases) do
        local result = job_service.compile_source(source({
            "@code-page 2 | " .. case.directive .. " | @text ¢ | @line",
        }), { profile = profile() })
        check.equal(#result.diagnostics, 0, case.directive)
        check.equal(result.preview_lines[#result.preview_lines].text, "¢")
        check.equal(result.preview_lines[#result.preview_lines]
            .segments[1].code_page, 0)
        check.equal(result.bytes, check.bytes(case.bytes), case.directive)
    end
end }

tests[#tests + 1] = { "compiler rejects uncatalogued hand-built page operations", function()
    local result = compiler.compile({
        version = 1,
        profile = {},
        diagnostics = {},
        ops = { { kind = "code_page", value = 20 } },
    }, { profile = profile() })

    check.truthy(has_diagnostic(result, "FORMAT_CODE_PAGE_UNAVAILABLE"))
    check.equal(#result.nodes, 1)
    check.equal(result.nodes[1].id, "control.initialize")
end }

return tests
