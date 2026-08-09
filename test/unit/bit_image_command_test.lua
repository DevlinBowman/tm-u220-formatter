-- Verifies exact TM-U220 ESC * and ESC U encoding, parsing, and model-wide limits.
-- Counted image bytes include control-looking values to prove payload framing is length-based.
local check = require("unit.support")
local encoder = require("tm_u220.escpos.encoder")
local parser = require("tm_u220.escpos.parser")

local tests = {}

local function encode(id, args)
    return encoder.encode({ { kind = "command", id = id, args = args } })
end

local function control_payload(count)
    local pattern = check.bytes("00 1B 40 0A 7F")
    return pattern:rep(math.floor(count / #pattern)) .. pattern:sub(1, count % #pattern)
end

tests[#tests + 1] = { "bit-image modes encode exact headers and opaque data", function()
    local data = check.bytes("00 1B 0A FF")
    local single = encode("printhead.bit_image", {
        mode = "single_density", width_dots = 4, data = data,
    })
    check.equal(#single.diagnostics, 0)
    check.equal(single.bytes, check.bytes("1B 2A 00 04 00") .. data)

    data = string.char(0xA5):rep(260)
    local double = encode("printhead.bit_image", {
        mode = "double_density", width_dots = 260, data = data,
    })
    check.equal(#double.diagnostics, 0)
    check.equal(double.bytes, check.bytes("1B 2A 01 04 01") .. data)
end }

tests[#tests + 1] = { "counted payload parsing preserves embedded commands and controls", function()
    local data = check.bytes("00 1B 40 0A 7F")
    local raw = check.bytes("1B 2A 00 05 00") .. data .. check.bytes("1B 55 01")
    local result = parser.parse(raw)
    check.equal(#result.diagnostics, 0)
    check.equal(#result.nodes, 2)
    check.equal(result.nodes[1].id, "printhead.bit_image")
    check.equal(result.nodes[1].args.mode, "single_density")
    check.equal(result.nodes[1].args.width_dots, 5)
    check.equal(result.nodes[1].args.data, data)
    check.equal(result.nodes[1].raw, raw:sub(1, 10))
    check.equal(result.nodes[1].span.last, 10)
    check.equal(result.nodes[2].id, "printhead.unidirectional")
    check.equal(result.nodes[2].args.enabled, true)
    check.equal(result.nodes[2].span.first, 11)

    local round_trip = encoder.encode(result.nodes)
    check.equal(#round_trip.diagnostics, 0)
    check.equal(round_trip.bytes, raw)
end }

tests[#tests + 1] = { "unidirectional mode encodes canonically and decodes its LSB", function()
    check.equal(encode("printhead.unidirectional", { enabled = false }).bytes,
        check.bytes("1B 55 00"))
    check.equal(encode("printhead.unidirectional", { enabled = true }).bytes,
        check.bytes("1B 55 01"))

    local parsed = parser.parse(check.bytes("1B 55 FE 1B 55 FF"))
    check.equal(#parsed.diagnostics, 0)
    check.equal(parsed.nodes[1].args.enabled, false)
    check.equal(parsed.nodes[2].args.enabled, true)
end }

tests[#tests + 1] = { "mode-dependent printhead width limits apply on encode", function()
    local cases = {
        { "single_density", 200, true },
        { "single_density", 201, false },
        { "double_density", 400, true },
        { "double_density", 401, false },
    }
    for _, case in ipairs(cases) do
        local result = encode("printhead.bit_image", {
            mode = case[1], width_dots = case[2], data = ("\0"):rep(case[2]),
        })
        check.equal(result.bytes ~= nil, case[3], case[1] .. " width " .. case[2])
    end
end }

tests[#tests + 1] = { "mode-dependent printhead width limits apply on decode", function()
    for _, case in ipairs({
        { header = "1B 2A 00 C9 00", width = 201 },
        { header = "1B 2A 01 91 01", width = 401 },
    }) do
        local raw = check.bytes(case.header) .. control_payload(case.width)
        local invalid = parser.parse(raw)
        check.equal(#invalid.diagnostics, 1)
        check.equal(invalid.diagnostics[1].code, "ESCPOS_INVALID_ARGUMENT")
        check.contains(invalid.diagnostics[1].message, "width_dots")
        check.equal(#invalid.nodes, 1)
        check.equal(invalid.nodes[1].kind, "unknown")
        check.equal(invalid.nodes[1].raw, raw)
    end

    local data = ("\0"):rep(400)
    local valid = parser.parse(check.bytes("1B 2A 01 90 01") .. data)
    check.equal(#valid.diagnostics, 0)
    check.equal(valid.nodes[1].args.width_dots, 400)
    check.equal(valid.nodes[1].args.data, data)
end }

tests[#tests + 1] = { "bit-image encoding rejects malformed payload contracts", function()
    local cases = {
        { mode = "unsupported", width_dots = 1, data = "\0" },
        { mode = "single_density", width_dots = 0, data = "" },
        { mode = "single_density", width_dots = 2, data = "\0" },
        { mode = "single_density", width_dots = 1, data = { 0 } },
        { mode = "single_density", width_dots = 1, data = "\0", extra = true },
    }
    for _, args in ipairs(cases) do
        local result = encode("printhead.bit_image", args)
        check.equal(result.bytes, nil)
        check.equal(result.diagnostics[1].code, "ENCODE_INVALID_ARGUMENT")
    end
end }

tests[#tests + 1] = { "truncated counted payload remains one atomic unknown node", function()
    local raw = check.bytes("1B 2A 00 03 00 00 1B")
    local result = parser.parse(raw)
    check.equal(#result.diagnostics, 1)
    check.equal(result.diagnostics[1].code, "ESCPOS_TRUNCATED_COMMAND")
    check.equal(#result.nodes, 1)
    check.equal(result.nodes[1].kind, "unknown")
    check.equal(result.nodes[1].command_id, "printhead.bit_image")
    check.equal(result.nodes[1].raw, raw)
    check.equal(result.nodes[1].span.last, #raw)
end }

return tests
