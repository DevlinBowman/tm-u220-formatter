-- Declares canonical TM-U220 physical dimensions, defaults, and mechanism limits.
local papers = {
    {
        id = "76mm",
        width_tenths_mm = 760,
        print_width_half_dots = { dip_2_1_on = 385, dip_2_1_off = 400 },
        columns = {
            dip_2_1_on = { font_a = 35, font_b = 42 },
            dip_2_1_off = { font_a = 33, font_b = 40 },
        },
    },
    {
        id = "69.5mm",
        width_tenths_mm = 695,
        print_width_half_dots = { dip_2_1_on = 360, dip_2_1_off = 360 },
        columns = {
            dip_2_1_on = { font_a = 32, font_b = 40 },
            dip_2_1_off = { font_a = 30, font_b = 36 },
        },
    },
    {
        id = "57.5mm",
        width_tenths_mm = 575,
        print_width_half_dots = { dip_2_1_on = 297, dip_2_1_off = 300 },
        columns = {
            dip_2_1_on = { font_a = 27, font_b = 33 },
            dip_2_1_off = { font_a = 25, font_b = 30 },
        },
    },
}

local paper_by_id = {}
for _, paper in ipairs(papers) do
    paper_by_id[paper.id] = paper
end

return {
    id = "epson.tm_u220",
    source = "Epson TM-U220 Technical Reference Guide, Rev. I",
    mechanism = "serial_impact_dot_matrix",
    units = {
        horizontal = { id = "half_dot_position", inch_numerator = 1, inch_denominator = 160 },
        vertical = { id = "vertical_motion_unit", inch_numerator = 1, inch_denominator = 144 },
    },
    paper_motion = {
        reverse_feed = {
            command_limit_vertical_units = 48,
            recovery_vertical_units = 12,
            mechanism_limit_vertical_units = { a = 48, b = 48, d = 31 },
        },
    },
    printer_types = {
        a = { autocutter = true, take_up_device = true, paper_ids = { "76mm" } },
        b = { autocutter = true, take_up_device = false,
            paper_ids = { "76mm", "69.5mm", "57.5mm" } },
        d = { autocutter = false, take_up_device = false,
            paper_ids = { "76mm", "69.5mm", "57.5mm" } },
    },
    fonts = {
        a = {
            matrix_width_half_dots = 9,
            matrix_height_dots = 9,
            character_cell_height_vertical_units = 18,
            character_width_micrometers = 1600,
            character_height_micrometers = 3100,
        },
        b = {
            matrix_width_half_dots = 7,
            matrix_height_dots = 9,
            character_cell_height_vertical_units = 18,
            character_width_micrometers = 1200,
            character_height_micrometers = 3100,
        },
    },
    dip_switch_2_1 = {
        default_on = false,
        character_spacing_half_dots = { on = 2, off = 3 },
    },
    defaults = {
        font = "b",
        line_spacing_vertical_units = 24,
        horizontal_tab_interval_columns = 8,
        emphasis = false,
        double_strike = false,
        double_width = false,
        double_height = false,
        underline = "off",
        color = "black",
        justification = "left",
        code_table = 0,
        upside_down = false,
    },
    papers = papers,
    paper_by_id = paper_by_id,
    cut = {
        factory_shape = "partial_one_point",
        full_cut_is_factory_option = true,
        head_to_cutter_approx_vertical_units = { a = 153, b = 153, d = 120 },
    },
}
