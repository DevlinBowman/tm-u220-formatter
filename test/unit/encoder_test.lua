local check = require("unit.support")
local encoder = require("tm_u220.escpos.encoder")

local tests = {}

local golden = {
    { "control.horizontal_tab", {}, "09" },
    { "print.line_feed", {}, "0A" },
    { "print.carriage_return", {}, "0D" },
    { "control.initialize", {}, "1B 40" },
    { "style.character_spacing", { half_dots = 7 }, "1B 20 07" },
    { "style.print_mode", { mode = { font_b = true, emphasized = true,
        double_height = true, double_width = true, underline = true } }, "1B 21 B9" },
    { "style.underline", { mode = "double" }, "1B 2D 02" },
    { "style.emphasis", { enabled = true }, "1B 45 01" },
    { "style.double_strike", { enabled = false }, "1B 47 00" },
    { "style.font", { font = "b" }, "1B 4D 01" },
    { "style.color", { color = "red" }, "1B 72 01" },
    { "style.code_table", { table = 19 }, "1B 74 13" },
    { "style.upside_down", { enabled = true }, "1B 7B 01" },
    { "style.upside_down", { enabled = false }, "1B 7B 00" },
    { "position.horizontal_tabs", { positions = { 8, 16, 24 } }, "1B 44 08 10 18 00" },
    { "position.justification", { justification = "right" }, "1B 61 02" },
    { "motion.default_line_spacing", {}, "1B 32" },
    { "motion.line_spacing", { vertical_units = 24 }, "1B 33 18" },
    { "print.feed_units", { vertical_units = 1 }, "1B 4A 01" },
    { "print.reverse_feed_units", { vertical_units = 2 }, "1B 4B 02" },
    { "print.feed_lines", { lines = 3 }, "1B 64 03" },
    { "print.reverse_feed_lines", { lines = 4 }, "1B 65 04" },
    { "mechanism.cut", { mode = "function_a_0" }, "1D 56 00" },
}

tests[#tests + 1] = { "all required commands match Epson bytes", function()
    for _, case in ipairs(golden) do
        local result = encoder.encode {
            { kind = "command", id = case[1], args = case[2] },
        }
        check.truthy(result.bytes, result.diagnostics[1] and result.diagnostics[1].message)
        check.equal(result.bytes, check.bytes(case[3]), case[1])
        check.equal(#result.diagnostics, 0)
    end
end }

tests[#tests + 1] = { "GS V function B requires and emits feed units", function()
    local result = encoder.encode {
        { kind = "command", id = "mechanism.cut",
            args = { mode = "function_b_65", feed_units = 9 } },
    }
    check.equal(result.bytes, check.bytes("1D 56 41 09"))
end }

tests[#tests + 1] = { "encoded parts retain structural command identity", function()
    local result = encoder.encode {
        { kind = "text", value = check.bytes("1B 40") },
        { kind = "command", id = "control.initialize", args = {} },
    }
    check.equal(#result.diagnostics, 0)
    check.equal(result.parts[1].node_kind, "text")
    check.equal(result.parts[1].command_id, nil)
    check.equal(result.parts[2].node_kind, "command")
    check.equal(result.parts[2].command_id, "control.initialize")
end }

tests[#tests + 1] = { "encoding failure is atomic", function()
    local result = encoder.encode {
        { kind = "text", value = "prefix" },
        { kind = "command", id = "style.font", args = { font = "unknown" } },
        { kind = "text", value = "suffix" },
    }
    check.equal(result.bytes, nil)
    check.equal(#result.diagnostics, 1)
    check.equal(result.diagnostics[1].code, "ENCODE_INVALID_ARGUMENT")
    check.equal(result.diagnostics[1].span.node_index, 2)
end }

tests[#tests + 1] = { "strict argument contracts reject malformed nodes", function()
    local nodes = {
        { id = "position.horizontal_tabs", args = { positions = { 8, 8 } } },
        { id = "style.print_mode", args = { mode = { font_b = "yes" } } },
        { id = "mechanism.cut", args = { mode = "function_b_65" } },
        { id = "mechanism.cut", args = { mode = "function_a_0", feed_units = 1 } },
        { id = "style.font", args = { font = "a", extra = true } },
        { id = "style.code_table", args = { table = 9 } },
        { id = "style.upside_down", args = { enabled = "yes" } },
    }
    for _, node in ipairs(nodes) do
        node.kind = "command"
        local result = encoder.encode { node }
        check.equal(result.bytes, nil)
        check.equal(#result.diagnostics, 1)
        check.equal(result.diagnostics[1].code, "ENCODE_INVALID_ARGUMENT")
    end
end }

tests[#tests + 1] = { "unknown node and sparse input fail without output", function()
    local unknown = encoder.encode { { kind = "unknown", raw = "x" } }
    check.equal(unknown.bytes, nil)
    check.equal(unknown.diagnostics[1].code, "ENCODE_INVALID_NODE")

    local sparse = encoder.encode { [2] = { kind = "text", value = "x" } }
    check.equal(sparse.bytes, nil)
    check.equal(sparse.diagnostics[1].code, "ENCODE_INVALID_INPUT")
end }

return tests
