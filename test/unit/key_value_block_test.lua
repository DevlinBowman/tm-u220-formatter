-- Verifies key/value block rows expand through the canonical @kv parser.
-- Marker structure stays source-only while row spans and layout behavior remain unchanged.
local check = require("unit.support")
local Compiler = require("tm_u220.app.job_compiler")
local JobService = require("tm_u220.app.job_service")
local job = require("tm_u220.job")

local tests = {}

local function parse(lines, options)
    local source = { "!tm-u220 job 1" }
    for _, line in ipairs(lines) do source[#source + 1] = line end
    return job.parse(table.concat(source, "\n"), options)
end

local function profile()
    return {
        variant = "B",
        paper = 76,
        dip2_1 = false,
        cutter = "partial",
    }
end

local function assert_kv(operation, left, right, line)
    check.equal(operation.kind, "kv")
    check.equal(operation.left, left)
    check.equal(operation.right, right)
    check.equal(operation.span.start_line, line)
    check.equal(operation.span.end_line, line)
end

tests[#tests + 1] = { "key-value block prefixes raw rows with canonical kv", function()
    local document = parse({
        " \t@kv_start\t ",
        "Coffee | $3.50",
        "Tax = $0.50",
        "@kv Total : $4.00",
        "\t@kv_end  ",
    })
    check.equal(#document.diagnostics, 0)
    check.equal(#document.ops, 3)
    assert_kv(document.ops[1], "Coffee", "$3.50", 3)
    assert_kv(document.ops[2], "Tax", "$0.50", 4)
    assert_kv(document.ops[3], "Total", "$4.00", 5)

    local crlf = job.parse(table.concat({
        "!tm-u220 job 1", "@kv_start", "CRLF | row", "@kv_end", "",
    }, "\r\n"))
    check.equal(#crlf.diagnostics, 0)
    assert_kv(crlf.ops[1], "CRLF", "row", 3)
end }

tests[#tests + 1] = { "key-value block owns directive-looking and comment-looking rows", function()
    local document = parse({
        "@kv_start",
        "# batch | 7",
        "@bold | $1.00",
        "@kv-end | marker-shaped data",
        "@kv_end",
    })
    check.equal(#document.diagnostics, 0)
    check.equal(#document.ops, 3)
    assert_kv(document.ops[1], "# batch", "7", 3)
    assert_kv(document.ops[2], "@bold", "$1.00", 4)
    assert_kv(document.ops[3], "@kv-end", "marker-shaped data", 5)
end }

tests[#tests + 1] = { "key-value block compiles like explicit kv rows", function()
    local wrapped = parse({
        "@kv_start",
        "Coffee | $3.50",
        "Tax = $0.50",
        "@kv_end",
    })
    local explicit = parse({
        "@kv Coffee | $3.50",
        "@kv Tax = $0.50",
    })
    local wrapped_result = Compiler.compile(wrapped, { profile = profile() })
    local explicit_result = Compiler.compile(explicit, { profile = profile() })
    check.equal(#wrapped_result.diagnostics, 0)
    check.equal(#explicit_result.diagnostics, 0)
    check.equal(#wrapped_result.preview_lines, #explicit_result.preview_lines)
    for index, line in ipairs(wrapped_result.preview_lines) do
        check.equal(line.text, explicit_result.preview_lines[index].text)
        check.equal(line.reason, "key_value")
    end

    local headerless = JobService.compile_content(table.concat({
        "@kv_start", "# [calc] hidden", "Coffee | $3.50", "",
        "Tax = $0.50", "@kv_end",
    }, "\n"), { profile = profile() })
    check.equal(#headerless.diagnostics, 0)
    check.equal(#headerless.preview_lines, 3)
    check.equal(headerless.preview_lines[1].text,
        explicit_result.preview_lines[1].text)
    check.equal(headerless.preview_lines[2].text, "")
    check.equal(headerless.preview_lines[3].text,
        explicit_result.preview_lines[2].text)
end }

tests[#tests + 1] = { "non-kv block lines retain their ordinary meaning", function()
    local document = parse({
        "@kv_start",
        "",
        "# ordinary comment",
        "ordinary text",
        "@emphasis on",
        "incomplete |",
        "@kv_end",
    })
    check.equal(#document.diagnostics, 0)
    check.equal(#document.ops, 4)
    check.equal(document.ops[1].kind, "line")
    check.equal(document.ops[1].span.start_line, 3)
    check.equal(document.ops[2].kind, "text_line")
    check.equal(document.ops[2].text, "ordinary text")
    check.equal(document.ops[3].kind, "emphasis")
    check.equal(document.ops[3].enabled, true)
    check.equal(document.ops[4].kind, "text_line")
    check.equal(document.ops[4].text, "incomplete |")
end }

tests[#tests + 1] = { "explicit kv rows remain strict inside a block", function()
    for _, source in ipairs({
        "@kv incomplete |",
        "@kv|LEFT|RIGHT",
        "@kv=RIGHT",
        "@kv:RIGHT",
        "@kv_end | marker-shaped data",
    }) do
        local document = parse({ "@kv_start", source, "@kv_end" })
        check.equal(#document.ops, 0, source)
        check.equal(#document.diagnostics, 1, source)
        check.equal(document.diagnostics[1].span.start_line, 3, source)
    end

    local aliases = { kv = { arguments = { { "text", "*" } } } }
    local canonical = parse({
        "@kv_start", "@kv Valid | Row", "@kv_end",
    }, { aliases = aliases })
    check.equal(#canonical.diagnostics, 0)
    assert_kv(canonical.ops[1], "Valid", "Row", 3)
end }

tests[#tests + 1] = { "key-value block reports invalid marker structure", function()
    local stray = parse({ "@kv_end" })
    check.equal(stray.diagnostics[1].code, "job.kv_block.not_active")
    check.equal(stray.diagnostics[1].span.start_line, 2)

    local nested = parse({
        "@kv_start",
        "First | 1",
        "@kv_start",
        "Second | 2",
        "@kv_end",
    })
    check.equal(#nested.ops, 2)
    check.equal(#nested.diagnostics, 1)
    check.equal(nested.diagnostics[1].code, "job.kv_block.nested")
    check.equal(nested.diagnostics[1].span.start_line, 4)

    local unclosed = parse({ "@kv_start", "Only | row" })
    check.equal(#unclosed.ops, 1)
    check.equal(unclosed.diagnostics[1].code, "job.kv_block.unclosed")
    check.equal(unclosed.diagnostics[1].span.start_line, 2)
end }

return tests
