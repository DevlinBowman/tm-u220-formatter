-- Proves a terminal reset may follow an implicit ordinary line without weakening literal tails.
-- Compilation coverage keeps the line feed before ESC @ and following content at defaults.
local AliasFile = require("tm_u220.job.directive.alias_file")
local check = require("unit.support")
local job = require("tm_u220.job")
local job_service = require("tm_u220.app.job_service")

local tests = {}

local function profile()
    return {
        variant = "B", paper = 76, dip2_1 = false, cutter = "partial",
    }
end

local function source(lines)
    if type(lines) == "string" then lines = { lines } end
    table.insert(lines, 1, "!tm-u220 job 1")
    return table.concat(lines, "\n")
end

local function parse(value, options)
    return job.parse(source(value), options)
end

local function kinds(document)
    local values = {}
    for index, operation in ipairs(document.ops) do
        values[index] = operation.kind
    end
    return table.concat(values, ",")
end

tests[#tests + 1] = { "terminal init follows a complete ordinary line", function()
    local cases = {
        { "@center Jeff @init", "align,text_line,init", 2, "Jeff" },
        { "@title Heading | @init",
            "align,double_width,double_height,emphasis,text_line,init",
            5, "Heading" },
        { "@title Heading|@init",
            "align,double_width,double_height,emphasis,text_line,init",
            5, "Heading" },
        { "@title   Heading\t@init  ",
            "align,double_width,double_height,emphasis,text_line,init",
            5, "  Heading" },
    }
    for _, case in ipairs(cases) do
        local document = parse(case[1])
        check.equal(#document.diagnostics, 0, case[1])
        check.equal(kinds(document), case[2], case[1])
        check.equal(document.ops[case[3]].text, case[4], case[1])
    end
end }

tests[#tests + 1] = { "padded directive chains do not gain an empty line", function()
    for _, value in ipairs({
        "@title|@init", "@title |@init", "@title| @init", "@title | @init",
    }) do
        local document = parse(value)
        check.equal(#document.diagnostics, 0, value)
        check.equal(kinds(document),
            "align,double_width,double_height,emphasis,init", value)
    end
end }

tests[#tests + 1] = { "only terminal init escapes an ordinary literal tail", function()
    local cases = {
        { "@center Jeff @init later", "text_line", "Jeff @init later" },
        { "@center Jeff | @init later", "text_line", "Jeff | @init later" },
        { "@text Jeff @init", "text", "Jeff @init" },
        { "@rule - @init", "rule", "- @init" },
    }
    for _, case in ipairs(cases) do
        local document = parse(case[1])
        check.equal(#document.diagnostics, 0, case[1])
        local operation = document.ops[#document.ops]
        check.equal(operation.kind, case[2], case[1])
        check.equal(operation.text or operation.pattern, case[3], case[1])
    end
end }

tests[#tests + 1] = { "postlude reset follows the feed and restores defaults", function()
    local concise = source({ "@title Heading @init", "Body" })
    local canonical = source({
        "@align center | @double-width off | @double-height on "
            .. "| @emphasis on | @text Heading | @line | @init",
        "Body",
    })
    local result = job_service.compile_source(concise, { profile = profile() })
    local expanded = job_service.compile_source(canonical, { profile = profile() })
    check.equal(#result.diagnostics, 0)
    check.equal(result.bytes, expanded.bytes)

    local feed_index, reset_index, resets = nil, nil, 0
    for index, node in ipairs(result.nodes) do
        if node.id == "print.line_feed" and not feed_index then feed_index = index end
        if node.id == "control.initialize" then
            resets = resets + 1
            reset_index = index
        end
    end
    check.equal(resets, 2)
    check.truthy(feed_index < reset_index)
    check.equal(result.preview_lines[1].justification, "center")
    check.equal(result.preview_lines[1].segments[1].style.emphasis, true)
    check.equal(result.preview_lines[1].segments[1].style.double_height, true)
    check.equal(result.preview_lines[2].justification, "left")
    check.equal(result.preview_lines[2].segments[1].style.emphasis, false)
    check.equal(result.preview_lines[2].segments[1].style.double_height, false)
end }

tests[#tests + 1] = { "postlude behavior follows canonical alias expansion", function()
    local reset = AliasFile.parse(table.concat({
        "!tm-u220 aliases 1", "@reset == @init",
    }, "\n"))
    local document = parse("@align center Jeff @reset", {
        aliases = reset.entries,
    })
    check.equal(#document.diagnostics, 0)
    check.equal(kinds(document), "align,text_line,init")

    local overridden = AliasFile.parse(table.concat({
        "!tm-u220 aliases 1", "@init == @emphasis on",
    }, "\n"))
    document = parse("@align center Jeff @init", {
        aliases = overridden.entries,
    })
    check.equal(#document.diagnostics, 0)
    check.equal(kinds(document), "align,text_line")
    check.equal(document.ops[2].text, "Jeff @init")
end }

return tests
