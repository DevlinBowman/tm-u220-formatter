local check = require("unit.support")
local spec = require("tm_u220.spec.index")

local tests = {}

tests[#tests + 1] = { "profile exposes official integer units", function()
    local model = spec.model
    check.equal(model.units.horizontal.id, "half_dot_position")
    check.equal(model.units.horizontal.inch_denominator, 160)
    check.equal(model.units.vertical.inch_denominator, 144)
    check.equal(model.defaults.font, "b")
    check.equal(model.defaults.line_spacing_vertical_units, 24)
    check.equal(model.defaults.upside_down, false)
end }

tests[#tests + 1] = { "Type A 76mm DIP-off profile", function()
    local profile, err = spec.profile.new {
        variant = "A", paper = 76, dip2_1 = false, cutter = "partial",
    }
    check.truthy(profile, err)
    check.equal(profile.print_width_half_dots, 400)
    check.equal(profile.character_spacing_half_dots, 3)
    check.equal(profile.columns.a, 33)
    check.equal(profile.columns.b, 40)
    check.equal(profile.autocutter, true)
    check.equal(profile.take_up_device, true)
    check.equal(profile.defaults.font, "b")
    check.equal(profile.defaults.upside_down, false)
    check.equal(profile.paper_motion.reverse_feed.command_limit_vertical_units, 48)
    check.equal(profile.paper_motion.reverse_feed.mechanism_limit_vertical_units, 48)
    check.equal(profile.paper_motion.reverse_feed.recovery_vertical_units, 12)
end }

tests[#tests + 1] = { "Type B 69.5mm DIP-on profile", function()
    local profile, err = spec.profile.new {
        variant = "B", paper = 69.5, dip2_1 = true, cutter = "full",
    }
    check.truthy(profile, err)
    check.equal(profile.print_width_half_dots, 360)
    check.equal(profile.character_spacing_half_dots, 2)
    check.equal(profile.columns.a, 32)
    check.equal(profile.columns.b, 40)
    check.equal(profile.autocutter, true)
    check.equal(profile.take_up_device, false)
end }

tests[#tests + 1] = { "Type D 57.5mm manual-cutter profile", function()
    local profile, err = spec.profile.new {
        variant = "D", paper = 57.5, dip2_1 = false, cutter = "none",
    }
    check.truthy(profile, err)
    check.equal(profile.print_width_half_dots, 300)
    check.equal(profile.columns.a, 25)
    check.equal(profile.columns.b, 30)
    check.equal(profile.autocutter, false)
    check.equal(profile.paper_motion.reverse_feed.mechanism_limit_vertical_units, 31)
end }

tests[#tests + 1] = { "DIP-on widths are paper-specific", function()
    local p76 = assert(spec.profile.new { variant = "B", paper = 76,
        dip2_1 = true, cutter = "partial" })
    local p575 = assert(spec.profile.new { variant = "B", paper = 57.5,
        dip2_1 = true, cutter = "partial" })
    check.equal(p76.print_width_half_dots, 385)
    check.equal(p76.columns.b, 42)
    check.equal(p575.print_width_half_dots, 297)
    check.equal(p575.columns.b, 33)
end }

tests[#tests + 1] = { "invalid profile combinations fail explicitly", function()
    local cases = {
        { { paper = 76 }, "variant" },
        { { variant = "A", paper = 69.5, cutter = "partial" }, "does not support" },
        { { variant = "D", paper = 76, cutter = "partial" }, "no autocutter" },
        { { variant = "B", paper = 76, cutter = "none" }, "has an autocutter" },
        { { variant = "B", paper = 80 }, "paper" },
        { { variant = "B", paper = 76, dip2_1 = "off" }, "boolean" },
    }
    for _, case in ipairs(cases) do
        local profile, err = spec.profile.new(case[1])
        check.falsy(profile)
        check.contains(err, case[2])
    end
end }

tests[#tests + 1] = { "effective defaults are not shared", function()
    local options = { variant = "B", paper = 76, cutter = "partial" }
    local first = assert(spec.profile.new(options))
    local second = assert(spec.profile.new(options))
    first.defaults.font = "a"
    check.equal(second.defaults.font, "b")
    check.equal(spec.model.defaults.font, "b")
end }

return tests
