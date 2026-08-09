-- Verifies that modeled reverse feed respects the TM-U220 command and mechanism limits.
local check = require("unit.support")
local paper_motion = require("tm_u220.format.paper_motion")
local profile = require("tm_u220.spec.profile")

local tests = {}

local function resolved(variant)
    return assert(profile.new {
        variant = variant,
        paper = 76,
        dip2_1 = false,
        cutter = variant == "D" and "none" or "partial",
    })
end

tests[#tests + 1] = { "reverse feed includes the TM-U220 mechanism recovery", function()
    local at_twelve = paper_motion.reverse(resolved("B"), 12)
    check.equal(at_twelve.commanded_vertical_units, 12)
    check.equal(at_twelve.reverse_vertical_units, 12)
    check.equal(at_twelve.recovery_vertical_units, 12)
    check.equal(at_twelve.effective_vertical_units, 0)

    local at_twenty_four = paper_motion.reverse(resolved("B"), 24)
    check.equal(at_twenty_four.reverse_vertical_units, 24)
    check.equal(at_twenty_four.recovery_vertical_units, 12)
    check.equal(at_twenty_four.effective_vertical_units, -12)
end }

tests[#tests + 1] = { "reverse feed respects mechanism limits", function()
    local type_d = paper_motion.reverse(resolved("D"), 48)
    check.equal(type_d.reverse_vertical_units, 31)
    check.equal(type_d.recovery_vertical_units, 12)
    check.equal(type_d.effective_vertical_units, -19)

    local excessive = paper_motion.reverse(resolved("B"), 49)
    check.equal(excessive.reverse_vertical_units, 0)
    check.equal(excessive.recovery_vertical_units, 0)
    check.equal(excessive.effective_vertical_units, 0)
end }

return tests
