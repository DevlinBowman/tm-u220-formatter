local check = require("unit.support")
local ProfileFile = require("tm_u220.profile.file")
local SpecProfile = require("tm_u220.spec.profile")

local tests = {}

local CANONICAL = table.concat({
    "!tm-u220 profile 1",
    "variant=B",
    "paper=69.5",
    "dip2_1=off",
    "cutter=full",
    "",
}, "\n")

local function has_code(result, code)
    for _, item in ipairs(result.diagnostics) do
        if item.code == code then return item end
    end
end

tests[#tests + 1] = { "profile file parses compiler-ready options", function()
    local result = ProfileFile.parse(CANONICAL)
    check.equal(#result.diagnostics, 0)
    check.equal(result.options.variant, "B")
    check.equal(result.options.paper, 69.5)
    check.equal(result.options.dip2_1, false)
    check.equal(result.options.cutter, "full")
    check.truthy(SpecProfile.new(result.options))
end }

tests[#tests + 1] = { "profile file permits comments blank lines and CRLF", function()
    local source = table.concat({
        "# selected at the printer", "", "!tm-u220 profile 1", "",
        "variant=D", "paper=57.5", "  # DIP switch setting", "dip2_1=on",
        "cutter=none", "",
    }, "\r\n")
    local result = ProfileFile.parse(source)
    check.equal(#result.diagnostics, 0)
    check.equal(result.options.variant, "D")
    check.equal(result.options.dip2_1, true)
end }

tests[#tests + 1] = { "profile serialization is canonical and round trips", function()
    local source, err = ProfileFile.serialize {
        variant = "b", paper = "69.5mm", dip2_1 = false, cutter = "full",
    }
    check.truthy(source, err and err.message)
    check.equal(source, CANONICAL)
    local parsed = ProfileFile.parse(source)
    check.equal(#parsed.diagnostics, 0)
    check.equal(ProfileFile.serialize(parsed.options), CANONICAL)
end }

tests[#tests + 1] = { "profile fields are explicit unique and known", function()
    local result = ProfileFile.parse(table.concat({
        "!tm-u220 profile 1", "variant=B", "variant=A", "paper_width=76",
        "dip2_1=maybe", "cutter=partial", "",
    }, "\n"))
    check.falsy(result.options)
    check.truthy(has_code(result, "PROFILE_FILE_DUPLICATE_FIELD"))
    check.truthy(has_code(result, "PROFILE_FILE_UNKNOWN_FIELD"))
    check.truthy(has_code(result, "PROFILE_FILE_INVALID_FIELD"))
    check.truthy(has_code(result, "PROFILE_FILE_MISSING_FIELD"))
end }

tests[#tests + 1] = { "profile field grammar is strict", function()
    local result = ProfileFile.parse(table.concat({
        "!tm-u220 profile 1", "variant = B", "paper=76", "dip2_1=off",
        "cutter=partial", "",
    }, "\n"))
    local item = has_code(result, "PROFILE_FILE_INVALID_SYNTAX")
    check.truthy(item)
    check.equal(item.span.start_line, 2)
    check.truthy(has_code(result, "PROFILE_FILE_MISSING_FIELD"))
end }

tests[#tests + 1] = { "profile header is exact and unique", function()
    local wrong = ProfileFile.parse("!tm-u220 profile 2\n")
    check.truthy(has_code(wrong, "PROFILE_FILE_HEADER_REQUIRED"))
    local duplicate = ProfileFile.parse(CANONICAL .. "!tm-u220 profile 1\n")
    check.truthy(has_code(duplicate, "PROFILE_FILE_HEADER_DUPLICATE"))
    local missing = ProfileFile.parse("# only a comment\n\n")
    check.truthy(has_code(missing, "PROFILE_FILE_HEADER_MISSING"))
end }

tests[#tests + 1] = { "cross-field profile rules are validated", function()
    local result = ProfileFile.parse(table.concat({
        "!tm-u220 profile 1", "variant=D", "paper=76", "dip2_1=off",
        "cutter=partial", "",
    }, "\n"))
    local item = has_code(result, "PROFILE_FILE_INVALID_PROFILE")
    check.truthy(item)
    check.contains(item.message, "no autocutter")
    check.falsy(result.options)
end }

tests[#tests + 1] = { "serialization rejects incomplete or invalid profiles", function()
    local source, err = ProfileFile.serialize {
        variant = "B", paper = 76, dip2_1 = false,
    }
    check.falsy(source)
    check.equal(err.code, "PROFILE_FILE_MISSING_FIELD")

    source, err = ProfileFile.serialize {
        variant = "A", paper = 57.5, dip2_1 = false, cutter = "partial",
    }
    check.falsy(source)
    check.equal(err.code, "PROFILE_FILE_INVALID_PROFILE")
end }

return tests
