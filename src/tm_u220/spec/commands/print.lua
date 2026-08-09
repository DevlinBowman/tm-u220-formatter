local function one_u8(id, mnemonic, effect, byte, argument)
    return {
        id = id,
        mnemonic = mnemonic,
        family = "print",
        effect = effect,
        prefix = { 0x1B, byte },
        args = { { name = argument, type = "u8", min = 0, max = 255 } },
    }
end

return {
    {
        id = "motion.default_line_spacing",
        mnemonic = "ESC 2",
        family = "print",
        effect = "default_line_spacing",
        prefix = { 0x1B, 0x32 },
        args = {},
    },
    one_u8("motion.line_spacing", "ESC 3", "set_line_spacing", 0x33, "vertical_units"),
    one_u8("print.feed_units", "ESC J", "print_and_feed_units", 0x4A, "vertical_units"),
    one_u8("print.reverse_feed_units", "ESC K", "print_and_reverse_units", 0x4B,
        "vertical_units"),
    one_u8("print.feed_lines", "ESC d", "print_and_feed_lines", 0x64, "lines"),
    one_u8("print.reverse_feed_lines", "ESC e", "print_and_reverse_lines", 0x65, "lines"),
}
