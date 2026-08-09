-- Declares the TM-U220 printhead commands used for direct eight-pin bit images.
-- Width-dependent payload metadata lets the shared codec preserve arbitrary image bytes.
return {
    {
        id = "printhead.bit_image",
        mnemonic = "ESC *",
        family = "printhead",
        effect = "store_bit_image",
        prefix = { 0x1B, 0x2A },
        args = {
            {
                name = "mode",
                type = "enum",
                encode = { single_density = 0, double_density = 1 },
                decode = { [0] = "single_density", [1] = "double_density" },
            },
            {
                name = "width_dots",
                type = "u16le",
                min = 1,
                max_by = {
                    arg = "mode",
                    values = { single_density = 200, double_density = 400 },
                },
            },
            {
                name = "data",
                type = "counted_bytes",
                count_from = "width_dots",
            },
        },
    },
    {
        id = "printhead.unidirectional",
        mnemonic = "ESC U",
        family = "printhead",
        effect = "set_unidirectional_printing",
        prefix = { 0x1B, 0x55 },
        args = { { name = "enabled", type = "lsb_boolean" } },
    },
}
