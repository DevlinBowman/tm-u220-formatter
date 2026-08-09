local check = require("unit.support")
local compiler = require("tm_u220.app.job_service")
local Directive = require("tm_u220.job.directive")
local job = require("tm_u220.job")

local tests = {}

local function count_command(result, id)
    local count = 0
    for _, node in ipairs(result.nodes or {}) do
        if node.kind == "command" and node.id == id then count = count + 1 end
    end
    return count
end

tests[#tests + 1] = { "directive sequences expand in written order", function()
    local document = job.parse(table.concat({
        "!tm-u220 job 1",
        "@font a | @emphasis on | @double-strike on | @double-width on "
            .. "| @double-height on | @underline double | @color red "
            .. "| @upside-down off | @spacing 2",
    }, "\n"))
    check.equal(#document.diagnostics, 0)

    local expected = {
        { "font", "value", "a" },
        { "emphasis", "enabled", true },
        { "double_strike", "enabled", true },
        { "double_width", "enabled", true },
        { "double_height", "enabled", true },
        { "underline", "value", "double" },
        { "color", "value", "red" },
        { "upside_down", "enabled", false },
        { "spacing", "value", 2 },
    }
    check.equal(#document.ops, #expected)
    for index, item in ipairs(expected) do
        check.equal(document.ops[index].kind, item[1])
        check.equal(document.ops[index][item[2]], item[3])
    end

    document = job.parse(
        "!tm-u220 job 1\n@underline single | @font b"
    )
    check.equal(document.ops[1].kind, "underline")
    check.equal(document.ops[2].kind, "font")

    document = job.parse(table.concat({
        "!tm-u220 job 1",
        "@init | @align center | @line-spacing default",
    }, "\n"))
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].kind, "init")
    check.equal(document.ops[2].kind, "align")
    check.equal(document.ops[3].kind, "line_spacing")
end }

tests[#tests + 1] = { "invalid directive sequences fail atomically", function()
    local cases = {
        "@font a | @",
        "@font a | @emphasis",
        "@font a | @text",
        "@font a | @emphasis maybe",
        "@font a | @unknown on",
        "@font a | @kv LEFT | RIGHT",
        "@text SAFE | @unknown on",
    }
    for _, source in ipairs(cases) do
        local document = job.parse("!tm-u220 job 1\n" .. source)
        check.equal(#document.ops, 0, source .. " must emit no operations")
        check.equal(#document.diagnostics, 1, source)
    end
end }

tests[#tests + 1] = { "directive sequences preserve non-separator pipes", function()
    local document = job.parse(table.concat({
        "!tm-u220 job 1",
        "@text contact | font a",
        "@line",
        "@kv LEFT | RIGHT",
        "@rule |",
        "@@font a | @emphasis on",
    }, "\n"))
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].text, "contact | font a")
    check.equal(document.ops[3].kind, "kv")
    check.equal(document.ops[3].right, "RIGHT")
    check.equal(document.ops[4].pattern, "|")
    check.equal(document.ops[5].text, "@font a | @emphasis on")

    document = job.parse("!tm-u220 job 1\n@kv LEFT | @RIGHT")
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].right, "@RIGHT")
end }

tests[#tests + 1] = { "text and actions alternate on one source line", function()
    local document = job.parse(table.concat({
        "!tm-u220 job 1",
        "@text 0 | @tab | @text 8 | @tab | @text 16 | @line",
    }, "\n"))
    check.equal(#document.diagnostics, 0)
    local expected = {
        { kind = "text", text = "0" },
        { kind = "tab" },
        { kind = "text", text = "8" },
        { kind = "tab" },
        { kind = "text", text = "16" },
        { kind = "line" },
    }
    check.equal(#document.ops, #expected)
    for index, wanted in ipairs(expected) do
        check.equal(document.ops[index].kind, wanted.kind)
        if wanted.text then
            check.equal(document.ops[index].text, wanted.text)
        end
    end
end }

tests[#tests + 1] = { "text can escape the reserved separator pipe", function()
    local document = job.parse(table.concat({
        "!tm-u220 job 1",
        "@text A \\| @font b | @line",
    }, "\n"))
    check.equal(#document.diagnostics, 0)
    check.equal(#document.ops, 2)
    check.equal(document.ops[1].kind, "text")
    check.equal(document.ops[1].text, "A | @font b")
    check.equal(document.ops[2].kind, "line")

    local result = compiler.compile_input(
        "@text A \\| @font b | @line"
    )
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text, "A | @font b")

    result = compiler.compile_input("C:\\Missing Folder\\receipt.txt")
    check.equal(result.diagnostics[1].code, "INPUT_FILE_READ_FAILED")

    result = compiler.compile_input("Literal A \\| B")
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text, "Literal A \\| B")
end }

tests[#tests + 1] = { "single directive parser retains its operation contract", function()
    local operation, failure = Directive.parse("@font a")
    check.falsy(failure)
    check.equal(operation.kind, "font")
    check.equal(operation.value, "a")
end }

tests[#tests + 1] = { "directive sequences respect interpreted and plain boundaries", function()
    local interpreted = compiler.compile_input(
        "@emphasis on | @font a\nStyled"
    )
    check.equal(#interpreted.diagnostics, 0)
    local style = interpreted.preview_lines[1].segments[1].style
    check.equal(style.emphasis, true)
    check.equal(style.font, "a")

    local escaped = compiler.compile_input("@@emphasis on | @font a")
    check.equal(escaped.preview_lines[1].text, "@emphasis on | @font a")
    check.equal(count_command(escaped, "style.emphasis"), 0)

    local plain = compiler.compile_input(
        "@emphasis on | @font a\nStyled",
        { text = true }
    )
    check.equal(#plain.diagnostics, 0)
    check.equal(plain.preview_lines[1].text, "@emphasis on | @font a")
    check.equal(plain.preview_lines[2].segments[1].style.emphasis, false)
    check.equal(count_command(plain, "style.emphasis"), 0)
end }

return tests
