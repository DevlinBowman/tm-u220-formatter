-- Declares style-state commands supported by the formatter's TM-U220 command model.
-- Character-table selection is closed to the same standard catalog used for text encoding.
local code_pages = require("tm_u220.charset.catalog")

local off_on = {
    name = "enabled",
    type = "enum",
    encode = { [false] = 0, [true] = 1 },
    decode = { [0] = false, [48] = false, [1] = true, [49] = true },
}

return {
    {
        id = "style.character_spacing",
        mnemonic = "ESC SP",
        family = "style",
        effect = "set_character_spacing",
        prefix = { 0x1B, 0x20 },
        args = { { name = "half_dots", type = "u8", min = 0, max = 255 } },
    },
    {
        id = "style.print_mode",
        mnemonic = "ESC !",
        family = "style",
        effect = "set_print_mode",
        prefix = { 0x1B, 0x21 },
        args = {
            {
                name = "mode",
                type = "bitfield",
                fields = {
                    { name = "font_b", mask = 0x01 },
                    { name = "emphasized", mask = 0x08 },
                    { name = "double_height", mask = 0x10 },
                    { name = "double_width", mask = 0x20 },
                    { name = "underline", mask = 0x80 },
                },
                reserved_mask = 0x46,
            },
        },
    },
    {
        id = "style.underline",
        mnemonic = "ESC -",
        family = "style",
        effect = "set_underline",
        prefix = { 0x1B, 0x2D },
        args = {
            { name = "mode", type = "enum",
                encode = { off = 0, single = 1, double = 2 },
                decode = { [0] = "off", [48] = "off", [1] = "single",
                    [49] = "single", [2] = "double", [50] = "double" } },
        },
    },
    {
        id = "style.emphasis",
        mnemonic = "ESC E",
        family = "style",
        effect = "set_emphasis",
        prefix = { 0x1B, 0x45 },
        args = { off_on },
    },
    {
        id = "style.double_strike",
        mnemonic = "ESC G",
        family = "style",
        effect = "set_double_strike",
        prefix = { 0x1B, 0x47 },
        args = { off_on },
    },
    {
        id = "style.font",
        mnemonic = "ESC M",
        family = "style",
        effect = "set_font",
        prefix = { 0x1B, 0x4D },
        args = {
            { name = "font", type = "enum", encode = { a = 0, b = 1 },
                decode = { [0] = "a", [48] = "a", [1] = "b", [49] = "b" } },
        },
    },
    {
        id = "style.color",
        mnemonic = "ESC r",
        family = "style",
        effect = "set_color",
        prefix = { 0x1B, 0x72 },
        args = {
            { name = "color", type = "enum", encode = { black = 0, red = 1 },
                decode = { [0] = "black", [48] = "black", [1] = "red", [49] = "red" } },
        },
    },
    {
        id = "style.code_table",
        mnemonic = "ESC t",
        family = "style",
        effect = "set_code_table",
        prefix = { 0x1B, 0x74 },
        args = { { name = "table", type = "enum",
            encode = code_pages.enum_encode, decode = code_pages.enum_decode } },
    },
    {
        id = "style.upside_down",
        mnemonic = "ESC {",
        family = "style",
        effect = "set_upside_down",
        prefix = { 0x1B, 0x7B },
        args = { { name = "enabled", type = "lsb_boolean" } },
    },
}
