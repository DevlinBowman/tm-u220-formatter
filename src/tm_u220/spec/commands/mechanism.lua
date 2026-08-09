return {
    {
        id = "mechanism.cut",
        mnemonic = "GS V",
        family = "mechanism",
        effect = "cut",
        prefix = { 0x1D, 0x56 },
        args = {
            {
                name = "mode",
                type = "enum",
                encode = {
                    function_a_0 = 0,
                    function_a_1 = 1,
                    function_a_48 = 48,
                    function_a_49 = 49,
                    function_b_65 = 65,
                    function_b_66 = 66,
                },
                decode = {
                    [0] = "function_a_0",
                    [1] = "function_a_1",
                    [48] = "function_a_48",
                    [49] = "function_a_49",
                    [65] = "function_b_65",
                    [66] = "function_b_66",
                },
            },
            {
                name = "feed_units",
                type = "u8",
                min = 0,
                max = 255,
                when = { arg = "mode", one_of = { "function_b_65", "function_b_66" } },
            },
        },
        support_by_type = {
            a = { function_a = true, function_b = true },
            b = { function_a = true, function_b = true },
            d = { function_a = false, function_b = true },
        },
    },
}
