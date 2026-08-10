-- Verifies image-interpretation profiles are strict, immutable, and independent effective values.
local check = require("unit.support")
local ImageProfile = require("tm_u220.printhead.image_profile")

local tests = {}

tests[#tests + 1] = { "image profile exposes photographic defaults", function()
    local profile = ImageProfile.defaults()
    check.equal(profile.version, 1)
    check.equal(profile.density, "solid")
    check.equal(profile.fit, "contain")
    check.equal(profile.resample, "bilinear")
    check.equal(profile.dither, "floyd")
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
        resample = "area",
        dither = "ordered",
        threshold = 200,
        invert = true,
        unidirectional = false,
        trailing_gap_vertical_units = 12,
        default_width_cells = 24,
        default_height_cells = 10,
    })
    check.equal(profile.density, "detail")
    check.equal(profile.fit, "cover")
    check.equal(profile.resample, "area")
    check.equal(profile.dither, "ordered")
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

tests[#tests + 1] = { "public options and schema are safe independent copies", function()
    local profile = assert(ImageProfile.new {
        dither = "floyd", threshold = 91, default_width_cells = 18,
    })
    local options = assert(ImageProfile.options(profile))
    check.equal(options.dither, "floyd")
    check.equal(options.threshold, 91)
    options.dither = "threshold"
    check.equal(profile.dither, "floyd")

    local schema = ImageProfile.schema()
    check.equal(schema.version, 1)
    check.equal(schema.header, "!tm-u220 image-profile 1")
    check.equal(#schema.fields, 10)
    check.equal(schema.fields[1].name, "density")
    check.equal(schema.fields[1].kind, "enum")
    check.equal(schema.fields[1].default, "solid")
    check.equal(schema.fields[1].choices[2], "detail")
    check.equal(schema.fields[3].default, "bilinear")
    check.equal(schema.fields[4].default, "floyd")
    check.equal(schema.fields[5].minimum, 0)
    check.equal(schema.fields[5].maximum, 255)
    check.equal(schema.fields[9].kind, "integer_or_keyword")
    check.equal(schema.fields[9].keyword, "page")
    schema.fields[1].choices[1] = "mutated"
    schema.fields[2].name = "mutated"
    local fresh = ImageProfile.schema()
    check.equal(fresh.fields[1].choices[1], "solid")
    check.equal(fresh.fields[2].name, "fit")
end }

tests[#tests + 1] = { "options reject non-profile tables", function()
    local options, err = ImageProfile.options({})
    check.equal(options, nil)
    check.equal(err, "value is not an image profile")
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
