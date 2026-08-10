-- Verifies the versioned image-profile text format is exact, diagnostic, and canonically serializable.
local check = require("unit.support")
local ImageProfile = require("tm_u220.printhead.image_profile")

local tests = {}

local CANONICAL = table.concat({
    "!tm-u220 image-profile 1",
    "density=solid",
    "fit=contain",
    "resample=bilinear",
    "dither=floyd",
    "threshold=128",
    "invert=off",
    "unidirectional=on",
    "trailing_gap_vertical_units=4",
    "default_width_cells=page",
    "default_height_cells=auto",
    "",
}, "\n")

local function has_code(result, code)
    for _, item in ipairs(result.diagnostics) do
        if item.code == code then return item end
    end
end

tests[#tests + 1] = { "image profile file parses an effective profile", function()
    local result = ImageProfile.parse(CANONICAL)
    check.equal(#result.diagnostics, 0)
    check.truthy(ImageProfile.is(result.profile))
    check.equal(result.profile.version, 1)
    check.equal(result.profile.default_width_cells, "page")
    check.equal(result.profile.default_height_cells, "auto")
end }

tests[#tests + 1] = { "profile file permits comments blank lines and CRLF", function()
    local source = CANONICAL:gsub("!tm%-u220", "# image defaults\r\n\r\n!tm-u220")
        :gsub("density=solid", "  # physical strike mode\r\ndensity=solid")
        :gsub("\n", "\r\n")
    local result = ImageProfile.parse(source)
    check.equal(#result.diagnostics, 0)
    check.equal(result.profile.density, "solid")
end }

tests[#tests + 1] = { "serialization is canonical and round trips", function()
    local source, err = ImageProfile.serialize(ImageProfile.defaults())
    check.truthy(source, err and err.message)
    check.equal(source, CANONICAL)
    local parsed = ImageProfile.parse(source)
    check.equal(#parsed.diagnostics, 0)
    check.equal(ImageProfile.serialize(parsed.profile), CANONICAL)

    source = assert(ImageProfile.serialize {
        density = "detail", fit = "stretch", resample = "area", dither = "ordered",
        threshold = 90, invert = true, unidirectional = false,
        trailing_gap_vertical_units = 0, default_width_cells = 18,
        default_height_cells = 7,
    })
    check.contains(source, "density=detail\n")
    check.contains(source, "invert=on\n")
    check.contains(source, "default_width_cells=18\n")
end }

tests[#tests + 1] = { "serialization preserves effective non-default model values", function()
    local profile = assert(ImageProfile.new {
        density = "detail", fit = "cover", resample = "nearest",
        dither = "threshold", threshold = 203, invert = true,
        unidirectional = false, trailing_gap_vertical_units = 9,
        default_width_cells = 22, default_height_cells = 11,
    })
    local source = assert(ImageProfile.serialize(profile))
    check.contains(source, "density=detail\n")
    check.contains(source, "fit=cover\n")
    check.contains(source, "resample=nearest\n")
    check.contains(source, "dither=threshold\n")
    check.contains(source, "threshold=203\n")
    check.contains(source, "invert=on\n")
    check.contains(source, "default_height_cells=11\n")
    local parsed = ImageProfile.parse(source)
    check.equal(#parsed.diagnostics, 0)
    check.equal(parsed.profile.dither, "threshold")
    check.equal(parsed.profile.default_width_cells, 22)
end }

tests[#tests + 1] = { "profile header is exact unique and versioned", function()
    check.equal(ImageProfile.HEADER, "!tm-u220 image-profile 1")
    check.equal(ImageProfile.VERSION, 1)
    local wrong = ImageProfile.parse(CANONICAL:gsub("image%-profile 1", "image-profile 2"))
    check.truthy(has_code(wrong, "IMAGE_PROFILE_FILE_HEADER_REQUIRED"))
    local duplicate = ImageProfile.parse(CANONICAL .. "!tm-u220 image-profile 1\n")
    check.truthy(has_code(duplicate, "IMAGE_PROFILE_FILE_HEADER_DUPLICATE"))
    local missing = ImageProfile.parse("# only a comment\n\n")
    check.truthy(has_code(missing, "IMAGE_PROFILE_FILE_HEADER_MISSING"))
end }

tests[#tests + 1] = { "all file fields are explicit unique and known", function()
    local result = ImageProfile.parse(table.concat({
        "!tm-u220 image-profile 1", "density=solid", "density=detail",
        "quality=high", "fit=contain", "resample=nearest", "dither=threshold",
        "threshold=128", "invert=off", "unidirectional=on",
        "trailing_gap_vertical_units=4", "default_width_cells=page", "",
    }, "\n"))
    check.falsy(result.profile)
    check.truthy(has_code(result, "IMAGE_PROFILE_FILE_DUPLICATE_FIELD"))
    check.truthy(has_code(result, "IMAGE_PROFILE_FILE_UNKNOWN_FIELD"))
    check.truthy(has_code(result, "IMAGE_PROFILE_FILE_MISSING_FIELD"))
end }

tests[#tests + 1] = { "profile field grammar is strict and reports its line", function()
    local result = ImageProfile.parse(CANONICAL:gsub("density=solid", "density = solid"))
    local item = has_code(result, "IMAGE_PROFILE_FILE_INVALID_SYNTAX")
    check.truthy(item)
    check.equal(item.span.start_line, 2)
    check.truthy(has_code(result, "IMAGE_PROFILE_FILE_MISSING_FIELD"))
end }

tests[#tests + 1] = { "profile file rejects invalid and noncanonical values", function()
    local replacements = {
        { "density=solid", "density=photo" },
        { "fit=contain", "fit=auto" },
        { "resample=bilinear", "resample=bicubic" },
        { "dither=floyd", "dither=random" },
        { "threshold=128", "threshold=0128" },
        { "invert=off", "invert=false" },
        { "unidirectional=on", "unidirectional=yes" },
        { "trailing_gap_vertical_units=4", "trailing_gap_vertical_units=256" },
        { "default_width_cells=page", "default_width_cells=0" },
        { "default_height_cells=auto", "default_height_cells=page" },
    }
    for _, replacement in ipairs(replacements) do
        local result = ImageProfile.parse(CANONICAL:gsub(replacement[1], replacement[2], 1))
        check.truthy(has_code(result, "IMAGE_PROFILE_FILE_INVALID_FIELD"), replacement[2])
        check.falsy(result.profile)
    end
end }

tests[#tests + 1] = { "serialization rejects invalid profile values", function()
    local source, err = ImageProfile.serialize("defaults")
    check.falsy(source)
    check.equal(err.code, "IMAGE_PROFILE_FILE_INVALID_INPUT")
    source, err = ImageProfile.serialize { resize = "nearest" }
    check.falsy(source)
    check.equal(err.code, "IMAGE_PROFILE_FILE_INVALID_PROFILE")
    check.contains(err.message, "unknown field resize")
end }

return tests
