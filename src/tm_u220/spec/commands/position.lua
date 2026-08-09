return {
    {
        id = "position.horizontal_tabs",
        mnemonic = "ESC D",
        family = "position",
        effect = "set_horizontal_tabs",
        prefix = { 0x1B, 0x44 },
        args = {
            {
                name = "positions",
                type = "terminated_u8_list",
                terminator = 0,
                min = 1,
                max = 255,
                max_count = 32,
                strictly_increasing = true,
            },
        },
    },
    {
        id = "position.justification",
        mnemonic = "ESC a",
        family = "position",
        effect = "set_justification",
        prefix = { 0x1B, 0x61 },
        args = {
            { name = "justification", type = "enum",
                encode = { left = 0, center = 1, right = 2 },
                decode = { [0] = "left", [48] = "left", [1] = "center",
                    [49] = "center", [2] = "right", [50] = "right" } },
        },
    },
}
