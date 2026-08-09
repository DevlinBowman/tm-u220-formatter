-- Verifies profile-driven fitting, resampling, inversion, and detail-density safety.
-- Fixtures stay tiny while exercising the same canonical masks used by printer bands.
local check = require("unit.support")
local DotMask = require("tm_u220.printhead.dot_mask")
local ImageProfile = require("tm_u220.printhead.image_profile")
local Prepare = require("tm_u220.printhead.image.prepare")

local tests = {}

local function mask(rows)
    return assert(DotMask.from_rows(rows))
end

local function prepare(source, profile, width, height)
    return assert(Prepare.run(source, assert(ImageProfile.new(profile)), {
        target_width_dots = width,
        target_height_dots = height,
        maximum_height_dots = 64,
    }))
end

tests[#tests + 1] = { "nearest stretch preserves a scaled binary quadrant", function()
    local result = prepare(mask({ { true, false }, { false, true } }), {
        fit = "stretch", resample = "nearest", dither = "threshold",
    }, 4, 4)
    check.equal(result.mask.data, check.bytes("C0 C0 30 30"))
end }

tests[#tests + 1] = { "automatic height respects solid dot aspect ratio", function()
    local result = assert(Prepare.run(mask({ { true, false }, { false, true } }),
        ImageProfile.defaults(), {
            target_width_dots = 20,
            maximum_height_dots = 64,
        }))
    check.equal(result.height_dots, 18)
    check.equal(result.horizontal_density_dpi, 80)
end }

tests[#tests + 1] = { "contain centers physical image pixels in a white box", function()
    local result = prepare(mask({ { true } }), {
        fit = "contain", resample = "nearest", dither = "threshold",
    }, 10, 10)
    check.equal(result.frame.width, 10)
    check.equal(result.frame.height, 9)
    check.equal(result.frame.top, 0)
    check.equal(result.mask:at(1, 10), false)
end }

tests[#tests + 1] = { "inversion and threshold choices affect target dots", function()
    local source = mask({ { true, false } })
    local normal = prepare(source, { fit = "stretch" }, 2, 1)
    local inverted = prepare(source, { fit = "stretch", invert = true }, 2, 1)
    check.equal(normal.mask.data, check.bytes("80"))
    check.equal(inverted.mask.data, check.bytes("40"))
end }

tests[#tests + 1] = { "detail output never contains horizontally adjacent strikes", function()
    for _, dither in ipairs({ "threshold", "ordered", "floyd" }) do
        local result = prepare(mask({ { true, true, true, true } }), {
            density = "detail", fit = "stretch", dither = dither,
        }, 8, 2)
        check.equal(result.mask:first_horizontal_adjacency(), nil, dither)
    end
end }

tests[#tests + 1] = { "target resource limits fail before band generation", function()
    local result, err = Prepare.run(mask({ { true } }), ImageProfile.defaults(), {
        target_width_dots = 10,
        target_height_dots = 65,
        maximum_height_dots = 64,
    })
    check.equal(result, nil)
    check.contains(err, "65 dots high; maximum is 64")
end }

return tests
