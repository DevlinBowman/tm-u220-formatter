-- Verifies configuration validation reuses the real alias and profile grammars after editing.
-- Temporary files keep the test independent of the developer's personal configuration.
local check = require("unit.support")
local Validation = require("tm_u220.config.validation")

local tests = {}

local function temporary_path(label)
    return os.tmpname() .. "-" .. label
end

local function write(path, value)
    local handle = assert(io.open(path, "wb"))
    handle:write(value)
    handle:close()
end

local function runtime(aliases, profile, image_profile)
    return { files = { active_path = function(name)
        if name == "aliases" then return aliases end
        if name == "profile" then return profile end
        return image_profile
    end } }
end

local IMAGE_PROFILE = table.concat({
    "!tm-u220 image-profile 1", "density=solid", "fit=contain",
    "resample=nearest", "dither=threshold", "threshold=128", "invert=off",
    "unidirectional=on", "trailing_gap_vertical_units=4",
    "default_width_cells=page", "default_height_cells=auto", "",
}, "\n")

tests[#tests + 1] = { "edited configuration validates through canonical parsers", function()
    local aliases = temporary_path("aliases.u220a")
    local profile = temporary_path("local.u220p")
    local image_profile = temporary_path("default.u220i")
    write(aliases, "!tm-u220 aliases 1\n@strong == @emphasis on\n")
    write(profile, table.concat({ "!tm-u220 profile 1", "variant=B", "paper=76",
        "dip2_1=off", "cutter=partial", "" }, "\n"))
    write(image_profile, IMAGE_PROFILE)
    local result, failure = Validation.check(runtime(aliases, profile, image_profile))
    os.remove(aliases)
    os.remove(profile)
    os.remove(image_profile)
    check.equal(failure, nil)
    check.equal(result.aliases_path, aliases)
    check.equal(result.profile_path, profile)
    check.equal(result.image_profile_path, image_profile)
end }

tests[#tests + 1] = { "invalid edited configuration fails without a fallback", function()
    local aliases = temporary_path("aliases.u220a")
    local profile = temporary_path("local.u220p")
    write(aliases, "!tm-u220 aliases 1\n@broken == @not-canonical\n")
    write(profile, "!tm-u220 profile 1\n")
    local result, failure = Validation.check(runtime(aliases, profile))
    os.remove(aliases)
    os.remove(profile)
    check.equal(result, nil)
    check.contains(failure, "directive aliases are invalid")
end }

return tests
