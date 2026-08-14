-- Exercises all three table alignment layers through complete compilation.
-- Invalid schemas and rows must fail atomically instead of clipping or wrapping fields.
local check = require("unit.support")
local jobs = require("tm_u220.app.job_service")

local tests = {}

local function profile()
    return {
        variant = "B", paper = 76, dip2_1 = false, cutter = "partial",
    }
end

local function compile(lines)
    table.insert(lines, 1, "!tm-u220 job 1")
    return jobs.compile_source(table.concat(lines, "\n"), { profile = profile() })
end

local function has_diagnostic(result, code)
    for _, item in ipairs(result.diagnostics or {}) do
        if item.code == code then return item end
    end
end

tests[#tests + 1] = { "default-left table keeps three columns in its right group", function()
    local result = compile({
        "@table 9,4,4LR,3LR,8RR",
        "@bold",
        "@head Board | Spcs | Pcs | Grd | Ea",
        "@bold-off",
        "@row 2x4x16 | RW | | | $29.99",
        "@row 2x6x12 | RW | 20 | CH | $29.99",
        "@end-table",
    })
    check.equal(#result.diagnostics, 0)
    check.truthy(result.bytes)
    check.equal(#result.preview_lines, 3)
    check.equal(result.preview_lines[1].text,
        "Board     Spcs         Pcs  Grd       Ea")
    check.equal(result.preview_lines[2].text,
        "2x4x16    RW                      $29.99")
    check.equal(result.preview_lines[3].text,
        "2x6x12    RW           20   CH    $29.99")
    for _, line in ipairs(result.preview_lines) do
        check.equal(#line.text, 40)
        check.equal(line.content_width_half_dots, 400)
    end
    check.equal(result.preview_lines[1].reason, "table_header")
    check.equal(result.preview_lines[2].reason, "table_row")
    check.equal(result.preview_lines[1].segments[1].style.emphasis, true)
    check.equal(result.preview_lines[2].segments[1].style.emphasis, false)
end }

tests[#tests + 1] = { "table placement and cell content alignment are independent", function()
    local left = compile({
        "@table 6,4C,3R",
        "@row é+ | X | 7",
        "@end-table",
    })
    check.equal(#left.diagnostics, 0)
    check.equal(left.preview_lines[1].text,
        "é+    " .. " " .. " X  " .. " " .. "  7" .. (" "):rep(25))
    check.equal(left.preview_lines[1].content_width_half_dots, 400)

    local right = compile({
        "@table R,6,4C,3R",
        "@row A | X | 7",
        "@end-table",
    })
    check.equal(#right.diagnostics, 0)
    check.equal(right.preview_lines[1].text,
        (" "):rep(25) .. "A     " .. " " .. " X  " .. " " .. "  7")
    check.equal(#right.preview_lines[1].text, 40)
end }

tests[#tests + 1] = { "table default can coexist with explicit column groups", function()
    local result = compile({
        "@table R,3LL,3",
        "@row L | R",
        "@end-table",
    })
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text,
        "L  " .. (" "):rep(34) .. "R  ")
end }

tests[#tests + 1] = { "current font determines the table coordinate space", function()
    local result = compile({
        "@font a",
        "@table R,3R",
        "@row Ea",
        "@end-table",
    })
    check.equal(#result.diagnostics, 0)
    check.equal(#result.preview_lines[1].text, 33)
    check.equal(result.preview_lines[1].text:sub(-3), " Ea")
    check.equal(result.preview_lines[1].content_width_half_dots, 396)
end }

tests[#tests + 1] = { "exact-width groups retain their implicit gaps", function()
    local result = compile({
        "@table 19,20",
        "@row A | B",
        "@end-table",
    })
    check.equal(#result.diagnostics, 0)
    check.equal(#result.preview_lines[1].text, 40)

    result = compile({
        "@table R,19,20",
        "@row A | B",
        "@end-table",
    })
    check.equal(#result.diagnostics, 0)
    check.equal(#result.preview_lines[1].text, 40)

    result = compile({
        "@table 19,20LR",
        "@row A | B",
        "@end-table",
    })
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text,
        "A" .. (" "):rep(19) .. "B" .. (" "):rep(19))
end }

tests[#tests + 1] = { "table blocks close, reopen, and print escaped pipes", function()
    local result = compile({
        "@table 5",
        "@row A \\| B",
        "@end-table",
        "@table R,3R",
        "@row 7",
        "@end-table",
    })
    check.equal(#result.diagnostics, 0)
    check.equal(#result.preview_lines, 2)
    check.equal(result.preview_lines[1].text:sub(1, 5), "A | B")
    check.equal(result.preview_lines[2].text:sub(-3), "  7")
end }

tests[#tests + 1] = { "table failures suppress printer bytes", function()
    local cases = {
        { { "@table 41" }, "FORMAT_TABLE_TOO_WIDE" },
        { { "@table 20,20" }, "FORMAT_TABLE_TOO_WIDE" },
        { { "@table 20,20LR" }, "FORMAT_TABLE_TOO_WIDE" },
        { { "@table 3LR,3LL" }, "FORMAT_TABLE_GROUP_ORDER" },
        {
            { "@table 3", "@row ABCD", "@end-table" },
            "FORMAT_TABLE_FIELD_TOO_WIDE",
        },
        {
            { "@table 3", "@row A | B", "@end-table" },
            "FORMAT_TABLE_FIELD_COUNT",
        },
        { { "@row A" }, "FORMAT_TABLE_NOT_ACTIVE" },
        {
            { "@table 3", "@table 3", "@end-table" },
            "FORMAT_TABLE_NESTED",
        },
        { { "@end-table" }, "FORMAT_TABLE_NOT_ACTIVE" },
        { { "@table 3", "@row A" }, "FORMAT_TABLE_UNCLOSED" },
        {
            { "@table 3", "@font a", "@row A", "@end-table" },
            "FORMAT_TABLE_LAYOUT_CHANGED",
        },
        {
            { "@table 3", "@fi", "@end-table" },
            "FORMAT_TABLE_LAYOUT_CHANGED",
        },
        { { "@text X", "@table 3" }, "FORMAT_REQUIRES_LINE_BEGINNING" },
    }

    for _, case in ipairs(cases) do
        local result = compile(case[1])
        check.truthy(has_diagnostic(result, case[2]), case[2])
        check.equal(result.bytes, nil, case[2] .. " must suppress bytes")
    end

    local invalid_row = compile({ "@table 3", "@row ABCD", "@end-table" })
    check.equal(#invalid_row.preview_lines, 0)
    for _, node in ipairs(invalid_row.nodes or {}) do
        check.falsy(node.kind == "text", "an invalid row emitted text")
    end

    local finish = compile({ "@table 3", "@fi", "@end-table" })
    check.contains(has_diagnostic(finish, "FORMAT_TABLE_LAYOUT_CHANGED").message,
        "@fi")
end }

return tests
