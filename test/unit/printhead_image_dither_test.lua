-- Verifies threshold, full-range ordered, and Floyd image dithering produce exact deterministic masks.
-- Hardware-safe detail output remains free of horizontally adjacent printhead strikes.
local check = require("unit.support")
local Dither = require("tm_u220.printhead.image.dither")

local tests = {}

local function repeated_gradient()
    local rows = {}
    for y = 1, 4 do
        rows[y] = { 0, 32, 64, 96, 128, 160, 192, 224 }
    end
    return rows
end

local function constant(value)
    local rows = {}
    for y = 1, 4 do
        rows[y] = { value, value, value, value }
    end
    return rows
end

tests[#tests + 1] = { "monochrome methods produce exact gradient masks", function()
    local expected = {
        threshold = "F0 F0 F0 F0",
        ordered = "EA D4 FA D0",
        floyd = "E8 F4 D2 E8",
    }
    for _, method in ipairs({ "threshold", "ordered", "floyd" }) do
        local mask = assert(Dither.run(repeated_gradient(), 8, 4,
            method, 128, false))
        check.equal(mask.data, check.bytes(expected[method]), method)
    end
end }

tests[#tests + 1] = { "ordered dithering spans highlight and shadow tones", function()
    local shadow = assert(Dither.run(constant(32), 4, 4,
        "ordered", 128, false))
    local highlight = assert(Dither.run(constant(224), 4, 4,
        "ordered", 128, false))
    check.equal(shadow.data, check.bytes("F0 D0 F0 70"))
    check.equal(highlight.data, check.bytes("80 00 20 00"))
end }

tests[#tests + 1] = { "detail safety removes every adjacent strike", function()
    local black = {
        { 0, 0, 0, 0, 0, 0, 0, 0 },
        { 0, 0, 0, 0, 0, 0, 0, 0 },
    }
    for _, method in ipairs({ "threshold", "ordered", "floyd" }) do
        local mask = assert(Dither.run(black, 8, 2, method, 128, true))
        check.equal(mask.data, check.bytes("AA AA"), method)
        check.equal(mask:first_horizontal_adjacency(), nil, method)
    end
end }

return tests
