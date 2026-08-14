-- Proves complete directives can share a source line without mandatory pipes.
-- Modifier preludes may hand their exact remaining payload to one ordinary text line.
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

local function source(value)
    return "!tm-u220 job 1\n" .. value
end

local function parse(value, options)
    return job.parse(source(value), options)
end

local function kinds(document)
    local values = {}
    for index, operation in ipairs(document.ops) do values[index] = operation.kind end
    return table.concat(values, ",")
end

tests[#tests + 1] = { "complete directives infer their next boundary", function()
    local cases = {
        { "@center @bold", "align,emphasis" },
        { "@align center @emphasis on", "align,emphasis" },
        { "@font a @spacing 2 @line-spacing default",
            "font,spacing,line_spacing" },
        { "@bold off @underline double", "emphasis,underline" },
        { "@normal-size @red @font-b",
            "double_width,double_height,color,font" },
        { "  @font a\t@emphasis on  @line", "font,emphasis,line" },
    }
    for _, case in ipairs(cases) do
        local document = parse(case[1])
        check.equal(#document.diagnostics, 0, case[1])
        check.equal(kinds(document), case[2], case[1])
    end
end }

tests[#tests + 1] = { "modifier preludes prefix ordinary line text", function()
    local cases = {
        { "@center Jeff", "align,text_line", "Jeff" },
        { "@bold Jeff", "emphasis,text_line", "Jeff" },
        { "@center @bold Jeff", "align,emphasis,text_line", "Jeff" },
        { "@align center @bold off Jeff",
            "align,emphasis,text_line", "Jeff" },
        { "@font-a Body", "font,text_line", "Body" },
        { "@red Total", "color,text_line", "Total" },
        { "@underline double Jeff", "underline,text_line", "Jeff" },
        { "@double-strike on Copy", "double_strike,text_line", "Copy" },
        { "@large Jeff", "double_width,double_height,text_line", "Jeff" },
        { "@title Heading",
            "align,double_width,double_height,emphasis,text_line", "Heading" },
        { "@spacing 2 Body", "spacing,text_line", "Body" },
        { "@line-spacing default Body", "line_spacing,text_line", "Body" },
        { "@code-page 2 ¢", "code_page,text_line", "¢" },
        { "@upside-down on Backward", "upside_down,text_line", "Backward" },
        { "@center   Jeff  ", "align,text_line", "  Jeff  " },
        { "@align center | Jeff", "align,text_line", "Jeff" },
        { "@center|Jeff", "align,text_line", "Jeff" },
        { "@center @bold|Jeff", "align,emphasis,text_line", "Jeff" },
        { "@bold off|Jeff", "emphasis,text_line", "Jeff" },
        { "@center |  Jeff", "align,text_line", " Jeff" },
        { "@center Jeff | Smith", "align,text_line", "Jeff | Smith" },
        { "@center Jeff @bold", "align,text_line", "Jeff @bold" },
    }
    for _, case in ipairs(cases) do
        local document = parse(case[1])
        check.equal(#document.diagnostics, 0, case[1])
        check.equal(kinds(document), case[2], case[1])
        check.equal(document.ops[#document.ops].text, case[3], case[1])
    end
end }

tests[#tests + 1] = { "implicit source syntax matches canonical bytes", function()
    local concise = source("@center @bold Jeff")
    local expanded = source(
        "@align center | @emphasis on | @text Jeff | @line")
    local concise_result = job_service.compile_source(concise, {
        profile = profile(),
    })
    local expanded_result = job_service.compile_source(expanded, {
        profile = profile(),
    })
    check.equal(#concise_result.diagnostics, 0)
    check.equal(concise_result.bytes, expanded_result.bytes)
end }

tests[#tests + 1] = { "free-form directives retain implicit-looking text", function()
    local document = parse("@text A @bold")
    check.equal(#document.diagnostics, 0)
    check.equal(kinds(document), "text")
    check.equal(document.ops[1].text, "A @bold")

    document = parse("@rule - @bold")
    check.equal(#document.diagnostics, 0)
    check.equal(kinds(document), "rule")
    check.equal(document.ops[1].pattern, "- @bold")
end }

tests[#tests + 1] = { "implicit sequences fail atomically", function()
    for _, value in ipairs({
        "@font @bold",
        "@font c @bold",
        "@font a @unknown on",
        "@font a @emphasis maybe",
        "@font a @image art.pbm",
        "@feed 2 Jeff",
        "@cut installed Jeff",
        "@fi Jeff",
        "@init Jeff",
        "@line Jeff",
        "@tab Jeff",
    }) do
        local document = parse(value)
        check.equal(#document.ops, 0, value)
        check.equal(#document.diagnostics, 1, value)
    end
end }

tests[#tests + 1] = { "dual-form aliases prefer a following directive", function()
    local configured = AliasFile.parse(table.concat({
        "!tm-u220 aliases 1",
        "@mark == @emphasis on",
        "@mark * == @text *",
        "@mixed == @emphasis on | @feed 1",
    }, "\n"))
    check.equal(#configured.diagnostics, 0)

    local options = { aliases = configured.entries }
    local document = parse("@mark @font a", options)
    check.equal(#document.diagnostics, 0)
    check.equal(kinds(document), "emphasis,font")

    document = parse("@mark hello @font-a", options)
    check.equal(#document.diagnostics, 0)
    check.equal(kinds(document), "text")
    check.equal(document.ops[1].text, "hello @font-a")

    document = parse("@mixed hello", options)
    check.equal(#document.ops, 0)
    check.equal(#document.diagnostics, 1)
end }

tests[#tests + 1] = { "expanded operations determine line ownership", function()
    local overridden = AliasFile.parse(table.concat({
        "!tm-u220 aliases 1",
        "@image == @align center",
        "@pic == @align center",
    }, "\n"))
    check.equal(#overridden.diagnostics, 0)
    for _, name in ipairs({ "image", "pic" }) do
        local document = parse("@" .. name .. " Jeff", {
            aliases = overridden.entries,
        })
        check.equal(#document.diagnostics, 0, name)
        check.equal(kinds(document), "align,text_line", name)
        check.equal(document.ops[2].text, "Jeff", name)
    end

    local forwarding = AliasFile.parse(table.concat({
        "!tm-u220 aliases 1",
        "@pic * == @image *",
    }, "\n"))
    check.equal(#forwarding.diagnostics, 0)
    local document = parse("@pic art.pbm @bold", {
        aliases = forwarding.entries,
    })
    check.equal(#document.ops, 0)
    check.equal(document.diagnostics[1].code,
        "job.directive.invalid_arguments")
end }

return tests
