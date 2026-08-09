-- Resolves validated printer options into an immutable compiler-ready TM-U220 profile.
local model = require("tm_u220.spec.model")

local M = {}

local paper_aliases = {
    [76] = "76mm",
    [69.5] = "69.5mm",
    [57.5] = "57.5mm",
    ["76"] = "76mm",
    ["76mm"] = "76mm",
    ["69.5"] = "69.5mm",
    ["69.5mm"] = "69.5mm",
    ["57.5"] = "57.5mm",
    ["57.5mm"] = "57.5mm",
}

local function contains(values, expected)
    for _, value in ipairs(values) do
        if value == expected then return true end
    end
    return false
end

local function normalize_variant(value)
    if type(value) ~= "string" then return nil end
    value = value:lower()
    if model.printer_types[value] then return value end
end

function M.new(options)
    options = options or {}
    local variant = normalize_variant(options.variant)
    if not variant then
        return nil, "variant must be A, B, or D"
    end

    local paper_id = paper_aliases[options.paper or 76]
    if not paper_id then
        return nil, "paper must be 76, 69.5, or 57.5 millimeters"
    end

    local variant_spec = model.printer_types[variant]
    if not contains(variant_spec.paper_ids, paper_id) then
        return nil, "Type " .. variant:upper() .. " does not support " .. paper_id .. " paper"
    end

    local dip_on = options.dip2_1
    if dip_on == nil then dip_on = model.dip_switch_2_1.default_on end
    if type(dip_on) ~= "boolean" then
        return nil, "dip2_1 must be boolean"
    end

    local cutter = options.cutter
    if cutter == nil then cutter = variant_spec.autocutter and "partial" or "none" end
    if cutter ~= "partial" and cutter ~= "full" and cutter ~= "none" then
        return nil, "cutter must be partial, full, or none"
    end
    if variant_spec.autocutter and cutter == "none" then
        return nil, "Type " .. variant:upper() .. " has an autocutter; select partial or full"
    end
    if not variant_spec.autocutter and cutter ~= "none" then
        return nil, "Type " .. variant:upper() .. " has no autocutter"
    end

    local paper = model.paper_by_id[paper_id]
    local dip_key = dip_on and "dip_2_1_on" or "dip_2_1_off"
    local columns = paper.columns[dip_key]
    local minimum_gap = dip_on
        and model.dip_switch_2_1.character_spacing_half_dots.on
        or model.dip_switch_2_1.character_spacing_half_dots.off
    local reverse_feed = model.paper_motion.reverse_feed
    local defaults = {
        font = model.defaults.font,
        character_spacing_half_dots = 0,
        line_spacing_vertical_units = model.defaults.line_spacing_vertical_units,
        horizontal_tab_interval_columns = model.defaults.horizontal_tab_interval_columns,
        emphasis = model.defaults.emphasis,
        double_strike = model.defaults.double_strike,
        double_width = model.defaults.double_width,
        double_height = model.defaults.double_height,
        underline = model.defaults.underline,
        color = model.defaults.color,
        justification = model.defaults.justification,
        code_table = model.defaults.code_table,
        upside_down = model.defaults.upside_down,
    }

    return {
        id = table.concat({ model.id, variant, paper_id, dip_on and "dip_on" or "dip_off" }, "."),
        model_id = model.id,
        variant = variant,
        paper_id = paper_id,
        paper_width_tenths_mm = paper.width_tenths_mm,
        dip2_1 = dip_on,
        cutter = cutter,
        autocutter = variant_spec.autocutter,
        take_up_device = variant_spec.take_up_device,
        print_width_half_dots = paper.print_width_half_dots[dip_key],
        head_to_cutter_vertical_units = model.cut.head_to_cutter_approx_vertical_units[
            variant],
        character_spacing_half_dots = minimum_gap,
        minimum_character_gap_half_dots = minimum_gap,
        columns = { a = columns.font_a, b = columns.font_b },
        defaults = defaults,
        default_font = model.defaults.font,
        default_line_spacing_vertical_units = model.defaults.line_spacing_vertical_units,
        default_horizontal_tab_interval_columns = model.defaults.horizontal_tab_interval_columns,
        default_emphasis = model.defaults.emphasis,
        default_double_strike = model.defaults.double_strike,
        default_double_width = model.defaults.double_width,
        default_double_height = model.defaults.double_height,
        default_underline = model.defaults.underline,
        default_color = model.defaults.color,
        default_justification = model.defaults.justification,
        default_code_table = model.defaults.code_table,
        default_upside_down = model.defaults.upside_down,
        units = model.units,
        fonts = model.fonts,
        paper_motion = {
            reverse_feed = {
                command_limit_vertical_units =
                    reverse_feed.command_limit_vertical_units,
                mechanism_limit_vertical_units =
                    reverse_feed.mechanism_limit_vertical_units[variant],
                recovery_vertical_units = reverse_feed.recovery_vertical_units,
            },
        },
    }
end

function M.validate(options)
    local value, err = M.new(options)
    return value ~= nil, err
end

return M
