-- Verifies compiler-owned paper coordinates, motion events, and glyph geometry.
local check = require("unit.support")
local jobs = require("tm_u220.app.job_service")

local tests = {}

local function profile()
    return { variant = "B", paper = 76, dip2_1 = false, cutter = "partial" }
end

local function compile(source, options)
    options = options or {}
    options.profile = options.profile or profile()
    return jobs.compile_content(source, options)
end

local function resident_hex(segment)
    local values = {}
    for index, byte in ipairs(segment.resident_bytes or {}) do
        values[index] = string.format("%02X", byte)
    end
    return table.concat(values, " ")
end

tests[#tests + 1] = { "buffer compilation prepares interpreted and plain content", function()
    local interpreted = compile("@align center\nLIVE")
    check.equal(#interpreted.diagnostics, 0)
    check.equal(interpreted.preview_lines[1].text, "LIVE")
    check.equal(interpreted.preview_lines[1].justification, "center")
    check.equal(interpreted.source_line_offset, 1)
    check.truthy(interpreted.bytes)

    local plain = compile("@align center", { text = true })
    check.equal(#plain.diagnostics, 0)
    check.equal(plain.preview_lines[1].text, "@align center")
    check.equal(plain.preview_lines[1].justification, "left")
    check.equal(plain.source_line_offset, 0)
end }

tests[#tests + 1] = { "paper preview records exact horizontal run geometry", function()
    local result = compile(table.concat({
        "@align center",
        "@text A",
        "@spacing 5",
        "@text B",
        "@line",
    }, "\n"))
    check.equal(#result.diagnostics, 0)
    local line = result.preview_lines[1]
    check.equal(line.content_width_half_dots, 25)
    check.equal(line.x_offset_half_dots, 187)
    check.equal(line.line_spacing_vertical_units, 24)
    check.equal(line.segments[1].x_half_dots, 0)
    check.equal(line.segments[1].width_half_dots, 10)
    check.equal(line.segments[1].character_advance_half_dots, 10)
    check.equal(line.segments[2].x_half_dots, 10)
    check.equal(line.segments[2].width_half_dots, 15)
    check.equal(line.segments[2].character_spacing_half_dots, 5)
    check.equal(line.segments[2].minimum_character_gap_half_dots, 3)
    check.equal(line.segments[2].effective_character_gap_half_dots, 8)
end }

tests[#tests + 1] = { "Unicode page runs preserve display text and one-cell geometry", function()
    local result = compile("Café Я", { text = true })
    check.equal(#result.diagnostics, 0)
    local line = result.preview_lines[1]
    check.equal(line.text, "Café Я")
    check.equal(line.content_width_half_dots, 60)
    check.equal(line.segments[1].text, "Café ")
    check.equal(line.segments[1].code_page, 0)
    check.equal(resident_hex(line.segments[1]), "43 61 66 82 20")
    check.equal(line.segments[1].x_half_dots, 0)
    check.equal(line.segments[1].width_half_dots, 50)
    check.equal(line.segments[2].text, "Я")
    check.equal(line.segments[2].code_page, 17)
    check.equal(resident_hex(line.segments[2]), "9F")
    check.equal(line.segments[2].x_half_dots, 50)
    check.equal(line.segments[2].width_half_dots, 10)
end }

tests[#tests + 1] = { "printer minimum gap is distinct from added spacing", function()
    local off = compile(table.concat({
        "@spacing 0", "@font b", "B", "@font a", "A",
        "@font b", "@spacing 1", "@double-width on", "X",
    }, "\n"))
    check.equal(#off.diagnostics, 0)
    check.equal(off.preview_lines[1].segments[1].character_advance_half_dots, 10)
    check.equal(off.preview_lines[2].segments[1].character_advance_half_dots, 12)
    check.equal(off.preview_lines[3].segments[1].character_advance_half_dots, 22)

    local on = compile("@spacing 0\n@font b\nB\n@font a\nA", {
        profile = { variant = "B", paper = 76, dip2_1 = true,
            cutter = "partial" },
    })
    check.equal(#on.diagnostics, 0)
    check.equal(on.preview_lines[1].segments[1].character_advance_half_dots, 9)
    check.equal(on.preview_lines[2].segments[1].character_advance_half_dots, 11)
end }

tests[#tests + 1] = { "paper preview preserves feed reverse and cut positions", function()
    local result = compile(table.concat({
        "A",
        "@feed 2",
        "B",
        "@reverse-units 12",
        "C",
        "@cut installed",
    }, "\n"))
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].y_vertical_units, 0)
    check.equal(result.preview_lines[2].y_vertical_units, 72)
    check.equal(result.preview_lines[3].y_vertical_units, 96)
    check.equal(result.paper_preview.min_y_vertical_units, 0)

    local cut
    local reverse
    for _, event in ipairs(result.paper_preview.events) do
        if event.kind == "cut" then cut = event end
        if event.reason == "reverse_units" then reverse = event end
    end
    check.equal(reverse.vertical_units, 0)
    check.equal(reverse.commanded_vertical_units, 12)
    check.equal(reverse.reverse_vertical_units, 12)
    check.equal(reverse.recovery_vertical_units, 12)
    check.equal(cut.shape, "partial")
    check.equal(cut.y_vertical_units, 273)
    check.equal(result.paper_preview.max_y_vertical_units, 273)
end }

tests[#tests + 1] = { "paper preview models recovered reverse-line motion", function()
    local result = compile(table.concat({
        "FIRST",
        "@reverse-units 12",
        "SECOND",
        "@reverse-lines 1",
        "THIRD",
    }, "\n"))
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].y_vertical_units, 0)
    check.equal(result.preview_lines[2].y_vertical_units, 24)
    check.equal(result.preview_lines[3].y_vertical_units, 36)
end }

tests[#tests + 1] = { "paper preview exposes source lines and doubled glyph height", function()
    local result = compile(
        "@double-height on\nTALL\n@double-height off\nNORMAL")
    check.equal(#result.diagnostics, 0)
    local line = result.preview_lines[1]
    check.equal(line.source_span.start_line, 3)
    check.equal(line.segments[1].source_span.start_line, 3)
    check.equal(line.glyph_height_vertical_units, 36)
    check.equal(line.line_advance_vertical_units, 42)
    check.truthy(line.glyph_height_vertical_units > line.line_spacing_vertical_units)
    check.equal(result.preview_lines[2].y_vertical_units, 42)
    check.equal(result.preview_lines[2].glyph_height_vertical_units, 18)
    check.equal(result.preview_lines[2].line_advance_vertical_units, 24)
end }

tests[#tests + 1] = { "blank styled lines use configured spacing only", function()
    local result = compile("@double-height on\n@line\n@double-height off\nNORMAL")
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].glyph_height_vertical_units, 0)
    check.equal(result.preview_lines[1].line_advance_vertical_units, 24)
    check.equal(result.preview_lines[2].y_vertical_units, 24)
end }

return tests
