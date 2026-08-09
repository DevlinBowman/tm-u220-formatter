-- Verifies image-interpretation profiles are strict, immutable, and independent effective values.
local check = require("unit.support")
local ImageProfile = require("tm_u220.printhead.image_profile")

local tests = {}

tests[#tests + 1] = { "image profile exposes conservative MVP defaults", function()
    local profile = ImageProfile.defaults()
    check.equal(profile.version, 1)
    check.equal(profile.density, "solid")
    check.equal(profile.fit, "contain")
    check.equal(profile.resample, "nearest")
    check.equal(profile.dither, "threshold")
    check.equal(profile.threshold, 128)
    check.equal(profile.invert, false)
    check.equal(profile.unidirectional, true)
    check.equal(profile.trailing_gap_vertical_units, 4)
    check.equal(profile.default_width_cells, "page")
    check.equal(profile.default_height_cells, "auto")
    check.truthy(ImageProfile.is(profile))
end }

tests[#tests + 1] = { "every interpretation setting can be overridden", function()
    local profile = assert(ImageProfile.new {
        density = "detail",
        fit = "cover",
        resample = "bilinear",
        dither = "floyd",
        threshold = 200,
        invert = true,
        unidirectional = false,
        trailing_gap_vertical_units = 12,
        default_width_cells = 24,
        default_height_cells = 10,
    })
    check.equal(profile.density, "detail")
    check.equal(profile.fit, "cover")
    check.equal(profile.resample, "bilinear")
    check.equal(profile.dither, "floyd")
    check.equal(profile.threshold, 200)
    check.equal(profile.invert, true)
    check.equal(profile.unidirectional, false)
    check.equal(profile.trailing_gap_vertical_units, 12)
    check.equal(profile.default_width_cells, 24)
    check.equal(profile.default_height_cells, 10)
end }

tests[#tests + 1] = { "profiles are read-only and defaults are independent", function()
    local first = ImageProfile.defaults()
    local second = ImageProfile.defaults()
    local ok, err = pcall(function() first.threshold = 20 end)
    check.falsy(ok)
    check.contains(err, "read-only")
    check.equal(second.threshold, 128)
end }

tests[#tests + 1] = { "enum settings reject unsupported values and types", function()
    local cases = {
        { { density = "photo" }, "solid or detail" },
        { { fit = "auto" }, "contain, cover, or stretch" },
        { { resample = "bicubic" }, "nearest, area, or bilinear" },
        { { dither = "random" }, "threshold, ordered, or floyd" },
        { { density = false }, "solid or detail" },
    }
    for _, case in ipairs(cases) do
        local profile, err = ImageProfile.new(case[1])
        check.falsy(profile)
        check.contains(err, case[2])
    end
end }

tests[#tests + 1] = { "bounded numeric settings require canonical integers", function()
    local cases = {
        { { threshold = -1 }, "0 through 255" },
        { { threshold = 256 }, "0 through 255" },
        { { threshold = 1.5 }, "0 through 255" },
        { { threshold = "128" }, "0 through 255" },
        { { trailing_gap_vertical_units = -1 }, "0 through 255" },
        { { trailing_gap_vertical_units = 256 }, "0 through 255" },
    }
    for _, case in ipairs(cases) do
        local profile, err = ImageProfile.new(case[1])
        check.falsy(profile)
        check.contains(err, case[2])
    end
    check.equal(assert(ImageProfile.new { threshold = 0 }).threshold, 0)
    check.equal(assert(ImageProfile.new { threshold = 255 }).threshold, 255)
end }

tests[#tests + 1] = { "flags require booleans", function()
    local profile, err = ImageProfile.new { invert = "off" }
    check.falsy(profile)
    check.contains(err, "invert must be boolean")
    profile, err = ImageProfile.new { unidirectional = 1 }
    check.falsy(profile)
    check.contains(err, "unidirectional must be boolean")
end }

tests[#tests + 1] = { "default dimensions accept one keyword or a positive integer", function()
    local cases = {
        { { default_width_cells = "auto" }, "positive integer or page" },
        { { default_width_cells = 0 }, "positive integer or page" },
        { { default_height_cells = "page" }, "positive integer or auto" },
        { { default_height_cells = 1.5 }, "positive integer or auto" },
    }
    for _, case in ipairs(cases) do
        local profile, err = ImageProfile.new(case[1])
        check.falsy(profile)
        check.contains(err, case[2])
    end
end }

tests[#tests + 1] = { "constructor rejects unknown fields and non-table input", function()
    local profile, err = ImageProfile.new { path = "photo.jpg" }
    check.falsy(profile)
    check.contains(err, "unknown field path")
    profile, err = ImageProfile.new("solid")
    check.falsy(profile)
    check.contains(err, "must be a table")
    check.falsy(ImageProfile.is({}))
end }

return tests
