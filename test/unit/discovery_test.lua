local check = require("unit.support")
local discovery = require("tm_u220.profile.discovery.init")
local spec_profile = require("tm_u220.spec.profile")

local tests = {}

local function expect_decode_error(query_id, response, code)
    local fact, err = discovery.decode(query_id, response)
    check.equal(fact, nil, "expected discovery decode failure")
    check.truthy(err)
    check.equal(err.code, code)
    check.equal(err.query_id, query_id)
end

tests[#tests + 1] = { "GS I discovery queries expose exact transport-neutral bytes", function()
    local expected = {
        { "gs_i.model_id", "1D 49 01" },
        { "gs_i.type_id", "1D 49 02" },
        { "gs_i.model_name", "1D 49 43" },
        { "gs_i.language_font", "1D 49 45" },
    }
    local queries = discovery.queries()
    check.equal(#queries, #expected)
    for index, case in ipairs(expected) do
        local query = queries[index]
        check.equal(query.id, case[1])
        check.equal(query.request, check.bytes(case[2]))
        check.equal(query.request_hex, case[2])
        check.equal(discovery.query(query.id).request, query.request)
    end
end }

tests[#tests + 1] = { "GS I printer IDs decode only documented TM-U220 facts", function()
    local model = assert(discovery.decode("gs_i.model_id", string.char(0x0D)))
    check.equal(model.printer_model_id, 13)
    check.equal(#model.model_candidates, 2)
    check.equal(model.model_candidates[1], "TM-U220")
    check.equal(model.model_candidates[2], "TM-U220II")

    local cutter = assert(discovery.decode("gs_i.type_id", string.char(0x03)))
    check.equal(cutter.autocutter_installed, true)
    check.equal(cutter.multi_byte_code_supported, true)
    check.equal(table.concat(cutter.variant_candidates), "ab")

    local reserved = assert(discovery.decode("gs_i.type_id", string.char(0x08)))
    check.equal(reserved.reserved_bits, 0x08)
    expect_decode_error("gs_i.model_id", string.char(0x0E),
        "DISCOVERY_NOT_TM_U220_FAMILY")
    expect_decode_error("gs_i.type_id", string.char(0x10),
        "DISCOVERY_INVALID_TM_U220_TYPE_ID")
end }

tests[#tests + 1] = { "printer information B framing rejects every malformed boundary", function()
    expect_decode_error("gs_i.type_id", "", "DISCOVERY_INVALID_RESPONSE_LENGTH")
    expect_decode_error("gs_i.type_id", "\0\0", "DISCOVERY_INVALID_RESPONSE_LENGTH")
    expect_decode_error("gs_i.model_name", "TM-U220\0", "DISCOVERY_INVALID_RESPONSE_HEADER")
    expect_decode_error("gs_i.model_name", "_TM-U220", "DISCOVERY_MISSING_TERMINATOR")
    expect_decode_error("gs_i.model_name", "_TM-U220\0X",
        "DISCOVERY_TRAILING_RESPONSE_DATA")
    expect_decode_error("gs_i.model_name", "_" .. string.char(0x80) .. "\0",
        "DISCOVERY_NON_ASCII_INFORMATION")
    expect_decode_error("gs_i.model_name", "_" .. ("A"):rep(81) .. "\0",
        "DISCOVERY_INFORMATION_TOO_LONG")
    expect_decode_error("gs_i.unknown", "_X\0", "DISCOVERY_UNKNOWN_QUERY")
end }

tests[#tests + 1] = { "exact model and language strings are closed-world", function()
    local model = assert(discovery.decode("gs_i.model_name", "_TM-U220\0"))
    check.equal(model.model_id, "epson.tm_u220")
    expect_decode_error("gs_i.model_name", "_TM-U220II\0",
        "DISCOVERY_UNSUPPORTED_MODEL")

    local language = assert(discovery.decode(
        "gs_i.language_font", "_CHINA GB18030\0"))
    check.equal(language.language, "simplified_chinese")
    check.equal(language.character_set, "GB18030")
    local empty = assert(discovery.decode("gs_i.language_font", "_\0"))
    check.equal(empty.reported, false)
    expect_decode_error("gs_i.language_font", "_UNLISTED\0",
        "DISCOVERY_UNSUPPORTED_LANGUAGE_RESPONSE")
end }

tests[#tests + 1] = { "partial discovery cannot become compiler profile options", function()
    local saved = assert(discovery.merge_responses({
        ["gs_i.model_id"] = string.char(0x0D),
        ["gs_i.model_name"] = "_TM-U220\0",
        ["gs_i.type_id"] = string.char(0x02),
    }))
    check.equal(saved.variant, nil)
    check.equal(saved.paper, nil)
    check.equal(saved.dip2_1, nil)
    check.equal(saved.cutter, nil)
    check.truthy(saved.unresolved.variant)
    check.truthy(saved.unresolved.paper)
    check.truthy(saved.unresolved.dip2_1)
    check.truthy(saved.unresolved.cutter)

    local options, err = discovery.to_compiler_profile(saved)
    check.equal(options, nil)
    check.equal(err.code, "DISCOVERY_PROFILE_UNRESOLVED")
    check.equal(table.concat(err.unresolved_fields, ","),
        "variant,paper,dip2_1,cutter")
end }

tests[#tests + 1] = { "explicit physical facts complete a discovered compiler profile", function()
    local saved = assert(discovery.merge_responses({
        ["gs_i.model_id"] = string.char(0x0D),
        ["gs_i.model_name"] = "_TM-U220\0",
        ["gs_i.type_id"] = string.char(0x03),
        ["gs_i.language_font"] = "_KANJI JAPANESE\0",
    }, {
        variant = "B", paper = 57.5, dip2_1 = true, cutter = "full",
    }))
    local options = assert(discovery.to_compiler_profile(saved))
    check.equal(options.variant, "b")
    check.equal(options.paper, "57.5mm")
    check.equal(options.dip2_1, true)
    check.equal(options.cutter, "full")
    local resolved = assert(spec_profile.new(options))
    check.equal(resolved.print_width_half_dots, 297)
    check.equal(resolved.columns.b, 33)

    local conflict, err = discovery.merge_responses({
        ["gs_i.type_id"] = string.char(0x02),
    }, { variant = "D", paper = 76, dip2_1 = false, cutter = "none" })
    check.equal(conflict, nil)
    check.equal(err.code, "DISCOVERY_FACT_CONFLICT")
end }

return tests
