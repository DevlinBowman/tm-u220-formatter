-- Proves compact native directive chains compile like their expanded form.
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

local function count_command(nodes, id)
    local count = 0
    for _, node in ipairs(nodes or {}) do
        if node.kind == "command" and node.id == id then count = count + 1 end
    end
    return count
end

tests[#tests + 1] = { "directive sequences match expanded directive bytes", function()
    local piped = table.concat({
        "!tm-u220 job 1",
        "@font a | @emphasis on | @double-strike on | @double-width on "
            .. "| @double-height on | @underline double | @color red",
        "MAXIMUM",
    }, "\n")
    local expanded = table.concat({
        "!tm-u220 job 1",
        "@font a", "@emphasis on", "@double-strike on", "@double-width on",
        "@double-height on", "@underline double", "@color red", "MAXIMUM",
    }, "\n")

    local piped_result = job_service.compile_source(piped, {
        profile = profile(),
    })
    local expanded_result = job_service.compile_source(expanded, {
        profile = profile(),
    })
    check.equal(#piped_result.diagnostics, 0)
    check.equal(#expanded_result.diagnostics, 0)
    check.equal(piped_result.bytes, expanded_result.bytes)

    local style = piped_result.preview_lines[1].segments[1].style
    check.equal(style.font, "a")
    check.equal(style.emphasis, true)
    check.equal(style.double_strike, true)
    check.equal(style.double_width, true)
    check.equal(style.double_height, true)
    check.equal(style.underline, "double")
    check.equal(style.color, "red")

    piped_result = job_service.compile_source(table.concat({
        "!tm-u220 job 1",
        "@double-width on | @emphasis on",
        "ORDERED",
    }, "\n"), { profile = profile() })
    expanded_result = job_service.compile_source(table.concat({
        "!tm-u220 job 1",
        "@double-width on",
        "@emphasis on",
        "ORDERED",
    }, "\n"), { profile = profile() })
    check.equal(piped_result.bytes, expanded_result.bytes)
end }

tests[#tests + 1] = { "sequenced line-bound directives retain placement checks", function()
    local source = table.concat({
        "!tm-u220 job 1",
        "@text X",
        "@font a | @color red | @upside-down on",
        "@line",
    }, "\n")
    local parsed = job.parse(source)
    local result = compiler.compile(parsed, { profile = profile() })
    check.equal(#result.diagnostics, 2)
    check.equal(result.diagnostics[1].code, "FORMAT_REQUIRES_LINE_BEGINNING")
    check.equal(result.diagnostics[2].code, "FORMAT_REQUIRES_LINE_BEGINNING")
    check.equal(count_command(result.nodes, "style.color"), 0)
    check.equal(count_command(result.nodes, "style.upside_down"), 0)

    result = job_service.compile_source(source, { profile = profile() })
    check.equal(result.bytes, nil)
end }

tests[#tests + 1] = { "text and tab actions compile from one source line", function()
    local piped = table.concat({
        "!tm-u220 job 1",
        "@text 0 | @tab | @text 8 | @tab | @text 16 | @tab "
            .. "| @text 24 | @tab | @text 32 | @line",
    }, "\n")
    local expanded = table.concat({
        "!tm-u220 job 1",
        "@text 0", "@tab", "@text 8", "@tab", "@text 16", "@tab",
        "@text 24", "@tab", "@text 32", "@line",
    }, "\n")
    local result = job_service.compile_source(piped, { profile = profile() })
    local expanded_result = job_service.compile_source(expanded, {
        profile = profile(),
    })
    check.equal(#result.diagnostics, 0)
    check.equal(result.bytes, expanded_result.bytes)
    check.equal(result.preview_lines[1].text,
        "0       8       16      24      32")
    check.equal(count_command(result.nodes, "control.horizontal_tab"), 4)
end }

return tests
