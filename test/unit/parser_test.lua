local check = require("unit.support")
local parser = require("tm_u220.escpos.parser")

local tests = {}

local golden = {
    { "control.horizontal_tab", "09" },
    { "print.line_feed", "0A" },
    { "print.carriage_return", "0D" },
    { "control.initialize", "1B 40" },
    { "style.character_spacing", "1B 20 07" },
    { "style.print_mode", "1B 21 B9" },
    { "style.underline", "1B 2D 02" },
    { "style.emphasis", "1B 45 01" },
    { "style.double_strike", "1B 47 00" },
    { "style.font", "1B 4D 01" },
    { "style.color", "1B 72 01" },
    { "style.code_table", "1B 74 13" },
    { "style.upside_down", "1B 7B 01" },
    { "position.horizontal_tabs", "1B 44 08 10 18 00" },
    { "position.justification", "1B 61 02" },
    { "motion.default_line_spacing", "1B 32" },
    { "motion.line_spacing", "1B 33 18" },
    { "print.feed_units", "1B 4A 01" },
    { "print.reverse_feed_units", "1B 4B 02" },
    { "print.feed_lines", "1B 64 03" },
    { "print.reverse_feed_lines", "1B 65 04" },
    { "mechanism.cut", "1D 56 00" },
}

tests[#tests + 1] = { "all golden commands parse with exact spans", function()
    for _, case in ipairs(golden) do
        local raw = check.bytes(case[2])
        local result = parser.parse(raw)
        check.equal(#result.diagnostics, 0, case[1])
        check.equal(#result.nodes, 1, case[1])
        local node = result.nodes[1]
        check.equal(node.kind, "command")
        check.equal(node.id, case[1])
        check.equal(node.raw, raw)
        check.equal(node.span.first, 1)
        check.equal(node.span.last, #raw)
    end
end }

tests[#tests + 1] = { "mixed text and commands preserve byte runs", function()
    local raw = "AB" .. check.bytes("1B 40") .. check.bytes("80") .. "Z" .. check.bytes("0A")
    local result = parser.parse(raw)
    check.equal(#result.diagnostics, 0)
    check.equal(#result.nodes, 4)
    check.equal(result.nodes[1].value, "AB")
    check.equal(result.nodes[1].span.first, 1)
    check.equal(result.nodes[1].span.last, 2)
    check.equal(result.nodes[2].id, "control.initialize")
    check.equal(result.nodes[2].span.first, 3)
    check.equal(result.nodes[2].span.last, 4)
    check.equal(result.nodes[3].value, check.bytes("80") .. "Z")
    check.equal(result.nodes[3].span.first, 5)
    check.equal(result.nodes[4].id, "print.line_feed")
    check.equal(result.nodes[4].span.first, 7)
end }

tests[#tests + 1] = { "numeric and ASCII enum aliases normalize", function()
    local result = parser.parse(check.bytes("1B 45 30 1B 4D 31 1B 61 32"))
    check.equal(#result.diagnostics, 0)
    check.equal(result.nodes[1].args.enabled, false)
    check.equal(result.nodes[2].args.font, "b")
    check.equal(result.nodes[3].args.justification, "right")
end }

tests[#tests + 1] = { "LSB booleans accept the full byte range", function()
    local result = parser.parse(check.bytes("1B 7B FE 1B 7B FF"))
    check.equal(#result.diagnostics, 0)
    check.equal(result.nodes[1].args.enabled, false)
    check.equal(result.nodes[2].args.enabled, true)
end }

tests[#tests + 1] = { "GS V conditional forms have distinct lengths", function()
    local raw = check.bytes("1D 56 00 1D 56 41 09")
    local result = parser.parse(raw)
    check.equal(#result.diagnostics, 0)
    check.equal(#result.nodes, 2)
    check.equal(result.nodes[1].span.last, 3)
    check.equal(result.nodes[2].span.first, 4)
    check.equal(result.nodes[2].span.last, 7)
    check.equal(result.nodes[2].args.feed_units, 9)
end }

tests[#tests + 1] = { "malformed commands become atomic unknown nodes", function()
    local cases = {
        { "1B", "ESCPOS_TRUNCATED_COMMAND", 1 },
        { "1B 45", "ESCPOS_TRUNCATED_COMMAND", 2 },
        { "1B 45 02", "ESCPOS_INVALID_ARGUMENT", 3 },
        { "1B 74 09", "ESCPOS_INVALID_ARGUMENT", 3 },
        { "1B 7B", "ESCPOS_TRUNCATED_COMMAND", 2 },
        { "1B 44 08", "ESCPOS_TRUNCATED_COMMAND", 3 },
        { "1D 56 41", "ESCPOS_TRUNCATED_COMMAND", 3 },
    }
    for _, case in ipairs(cases) do
        local raw = check.bytes(case[1])
        local result = parser.parse(raw)
        check.equal(#result.diagnostics, 1)
        check.equal(#result.nodes, 1)
        check.equal(result.diagnostics[1].code, case[2])
        check.equal(result.diagnostics[1].span.first, 1)
        check.equal(result.diagnostics[1].span.last, case[3])
        check.equal(result.nodes[1].kind, "unknown")
        check.equal(result.nodes[1].raw, raw)
    end
end }

tests[#tests + 1] = { "unknown controls do not swallow adjacent text", function()
    local result = parser.parse("A" .. check.bytes("00") .. "B")
    check.equal(#result.diagnostics, 1)
    check.equal(result.diagnostics[1].code, "ESCPOS_UNKNOWN_CONTROL")
    check.equal(result.diagnostics[1].span.first, 2)
    check.equal(result.diagnostics[1].span.last, 2)
    check.equal(#result.nodes, 3)
    check.equal(result.nodes[1].value, "A")
    check.equal(result.nodes[2].raw, check.bytes("00"))
    check.equal(result.nodes[3].value, "B")
end }

return tests
