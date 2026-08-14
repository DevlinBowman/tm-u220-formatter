-- Verifies that the checked-in printable examples compile through their intended formatter paths.
-- The capability sheet covers styling, while examples/chars.txt covers the public standard-page repertoire.
local check = require("unit.support")
local Defaults = require("tm_u220.app.local_defaults")
local JobService = require("tm_u220.app.job_service")
local Pages = require("tm_u220.charset.pages")

local tests = {}

local function commands(nodes)
    local found = {}
    for _, node in ipairs(nodes or {}) do
        if node.kind == "command" then found[node.id] = true end
    end
    return found
end

local function styles(lines)
    local found = {
        font = {}, emphasis = {}, double_strike = {},
        double_width = {}, double_height = {}, underline = {}, color = {},
        upside_down = {},
    }
    for _, line in ipairs(lines or {}) do
        check.falsy(line.reason == "wrap", "example text must not wrap unexpectedly")
        for _, segment in ipairs(line.segments or {}) do
            for name in pairs(found) do
                found[name][tostring(segment.style[name])] = true
            end
        end
    end
    return found
end

local function find_line(lines, expected)
    for _, line in ipairs(lines or {}) do
        if line.text == expected then return line end
    end
end

local function command_values(nodes, id, argument)
    local found = {}
    for _, node in ipairs(nodes or {}) do
        if node.kind == "command" and node.id == id then
            found[node.args[argument]] = true
        end
    end
    return found
end

local function assert_style(lines, text, expected)
    local line = find_line(lines, text)
    check.truthy(line, "example is missing visible line " .. text)
    local style = line.segments[1].style
    for name, value in pairs(expected) do
        check.equal(style[name], value, text .. " has the wrong " .. name)
    end
end

tests[#tests + 1] = { "example text prints the visible capability specimen", function()
    local path = Defaults.project_root() .. "/examples/example.txt"
    local result = JobService.compile_input(path, {})
    check.equal(#(result.diagnostics or {}), 0)
    check.equal(result.profile.id, "epson.tm_u220.b.76mm.dip_off")
    check.equal(result.profile.columns.b, 40)
    check.truthy(type(result.bytes) == "string" and #result.bytes > 0)

    local seen = commands(result.nodes)
    for _, id in ipairs({ "position.justification", "style.font",
        "style.emphasis", "style.double_strike", "style.print_mode",
        "style.underline", "style.color", "style.upside_down",
        "style.character_spacing",
        "motion.line_spacing", "motion.default_line_spacing",
        "control.horizontal_tab", "print.line_feed", "print.feed_lines",
        "print.feed_units", "print.reverse_feed_lines",
        "print.reverse_feed_units", "mechanism.cut" }) do
        check.truthy(seen[id], "example is missing " .. id)
    end
    check.truthy(result.finish and result.finish.advance_to_cut_position)
    check.equal(result.finish.feed_lines, 4)
    check.equal(result.finish.cut_shape, "partial")

    local aligned = {}
    for _, line in ipairs(result.preview_lines) do aligned[line.justification] = true end
    check.truthy(aligned.left and aligned.center and aligned.right)
    check.truthy(find_line(result.preview_lines,
        "# 3 C S c s â ô ú │ ├ ╙ π ≤"))
    check.truthy(find_line(result.preview_lines, "0       8       16      24      32"))
    check.truthy(find_line(result.preview_lines,
        "Board     Spcs         Pcs  Grd       Ea"))
    check.truthy(find_line(result.preview_lines,
        "2x4x16    RW                      $29.99"))
    check.truthy(find_line(result.preview_lines,
        "2x6x12    RW           20   CH    $29.99"))

    local spacing = command_values(result.nodes, "style.character_spacing", "half_dots")
    for value = 0, 7 do check.truthy(spacing[value], "missing spacing " .. value) end
    local line_spacing = command_values(result.nodes, "motion.line_spacing", "vertical_units")
    check.truthy(line_spacing[12] and line_spacing[24] and line_spacing[36])
    local orientation = command_values(result.nodes, "style.upside_down", "enabled")
    check.truthy(orientation[true] and orientation[false])

    local styled = styles(result.preview_lines)
    check.truthy(styled.font.a and styled.font.b)
    check.truthy(styled.emphasis["true"] and styled.emphasis["false"])
    check.truthy(styled.double_strike["true"] and styled.double_strike["false"])
    check.truthy(styled.double_width["true"] and styled.double_width["false"])
    check.truthy(styled.double_height["true"] and styled.double_height["false"])
    check.truthy(styled.underline.single and styled.underline.double
        and styled.underline.off)
    check.truthy(styled.color.red and styled.color.black)
    check.truthy(styled.upside_down["true"] and styled.upside_down["false"])

    assert_style(result.preview_lines, "A EMPH BIG 2X2", {
        font = "a", emphasis = true, double_width = true, double_height = true,
    })
    assert_style(result.preview_lines, "B EMPH BIG 2X2", {
        font = "b", emphasis = true, double_width = true, double_height = true,
    })
    assert_style(result.preview_lines, "MAXIMUM", {
        font = "a", emphasis = true, double_strike = true,
        double_width = true, double_height = true, underline = "double",
        color = "red",
    })
    assert_style(result.preview_lines, "180 DEGREE UPSIDE-DOWN", {
        upside_down = true,
    })
end }

local function manual_row(page, first_column, low)
    local cells = {}
    for high = first_column, 0xF do
        local byte = high * 0x10 + low
        cells[#cells + 1] = Pages.pages[page][byte]
            and string.char(byte) or string.char(0x20)
    end
    return table.concat(cells, string.char(0x20))
end

tests[#tests + 1] = { "chars text selects every public standard-page coordinate", function()
    local path = Defaults.project_root() .. "/examples/chars.txt"
    local result = JobService.compile_input(path, {})
    check.equal(#(result.diagnostics or {}), 0)
    check.truthy(type(result.bytes) == "string" and #result.bytes > 3000)
    local search_from = 1
    for _, page in ipairs({ 0, 2, 3, 4, 5, 16, 17, 18, 19 }) do
        check.truthy(find_line(result.preview_lines,
                "PAGE " .. page .. " " .. Pages.names[page]),
            "examples/chars.txt is missing page " .. page)
        local first_column = page == 0 and 2 or 8
        for low = 0, 0xF do
            local suffix = page == 0 and check.bytes("0A")
                or check.bytes("1B 74 00 0A")
            local expected = check.bytes(string.format("1B 74 %02X", page))
                .. manual_row(page, first_column, low) .. suffix
            local first, last = result.bytes:find(expected, search_from, true)
            check.truthy(first,
                string.format("examples/chars.txt is missing page %d printable row %X", page, low))
            search_from = last + 1
        end
    end
end }

return tests
