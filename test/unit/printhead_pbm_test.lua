-- Verifies strict binary PBM ingestion preserves raster bytes and enforces canonical mask limits.
local check = require("unit.support")
local Pbm = require("tm_u220.printhead.pbm")

local tests = {}

local LIMITS = {
    maximum_width = 400,
    maximum_height = 2048,
    maximum_pixels = 819200,
    maximum_payload_bytes = 1048576,
}

local function decode(source, overrides)
    local limits = {}
    for key, value in pairs(LIMITS) do limits[key] = value end
    for key, value in pairs(overrides or {}) do limits[key] = value end
    return Pbm.decode(source, limits)
end

tests[#tests + 1] = { "P4 headers accept ASCII whitespace and comments", function()
    local data = check.bytes("80 40 00 00")
    local mask = assert(decode("P4\t# first\r\n 10\v# width\n\f2\n" .. data))
    check.equal(mask.width, 10)
    check.equal(mask.height, 2)
    check.equal(mask.row_stride_bytes, 2)
    check.equal(mask.data, data)
end }

tests[#tests + 1] = { "the exact binary raster preserves control and header-looking bytes", function()
    local data = "\0#\n\27"
    local mask = assert(decode("P4\n32 1\n" .. data))
    check.equal(mask.data, data)
    check.equal(mask:at(11, 1), true)
end }

tests[#tests + 1] = { "a comment may directly follow height before its raster delimiter", function()
    local mask = assert(decode("P4\n8 1# final comment\n" .. "\128"))
    check.equal(mask.data, "\128")

    local hash_raster = assert(decode("P4\n8 1 " .. "#"))
    check.equal(hash_raster.data, "#")
end }

tests[#tests + 1] = { "only the binary P4 magic with a separated header is accepted", function()
    local cases = {
        { "", "magic must be P4" },
        { "P1\n1 1\n0", "magic must be P4" },
        { "P4", "magic and width must be separated" },
        { "P41 1\n\0", "magic and width must be separated" },
    }
    for _, case in ipairs(cases) do
        local value, err = decode(case[1])
        check.equal(value, nil)
        check.contains(err, case[2])
    end
end }

tests[#tests + 1] = { "dimensions are strict positive decimal integers", function()
    local cases = {
        { "P4\n0 1\n", "width must be a positive decimal integer" },
        { "P4\n1 0\n", "height must be a positive decimal integer" },
        { "P4\n+1 1\n\0", "width must be a positive decimal integer" },
        { "P4\n-1 1\n\0", "width must be a positive decimal integer" },
        { "P4\n1x 1\n\0", "width must contain only decimal digits" },
        { "P4\n1 1.0\n\0", "height must contain only decimal digits" },
    }
    for _, case in ipairs(cases) do
        local value, err = decode(case[1])
        check.equal(value, nil)
        check.contains(err, case[2])
    end
end }

tests[#tests + 1] = { "the raster length is exact and trailing bytes are rejected", function()
    local cases = {
        { "P4\n9 2\n\0\0\0", "exactly 4 bytes; got 3" },
        { "P4\n8 1\n\0\n", "exactly 1 bytes; got 2" },
        { "P4\n8 1", "followed by one whitespace byte" },
        { "P4\n8 1# unterminated", "followed by one whitespace byte" },
    }
    for _, case in ipairs(cases) do
        local value, err = decode(case[1])
        check.equal(value, nil)
        check.contains(err, case[2])
    end
end }

tests[#tests + 1] = { "canonical row padding must contain zero bits", function()
    local mask, err = decode("P4\n9 2\n" .. check.bytes("80 01 00 00"))
    check.equal(mask, nil)
    check.contains(err, "row padding bits must be zero")
end }

tests[#tests + 1] = { "caller limits bound dimensions, pixels, and raster bytes", function()
    local cases = {
        { "P4\n11 1\n\0\0", { maximum_width = 10 }, "width exceeds maximum 10" },
        { "P4\n1 11\n" .. string.rep("\0", 11),
            { maximum_height = 10 }, "height exceeds maximum 10" },
        { "P4\n9 2\n" .. string.rep("\0", 4),
            { maximum_pixels = 17 }, "maximum 17 pixels" },
        { "P4\n9 2\n" .. string.rep("\0", 4),
            { maximum_payload_bytes = 3 }, "maximum 3 bytes" },
        { "P4\n999999999999999999999 1\n", {}, "width exceeds maximum 400" },
    }
    for _, case in ipairs(cases) do
        local value, err = decode(case[1], case[2])
        check.equal(value, nil)
        check.contains(err, case[3])
    end
end }

tests[#tests + 1] = { "limit options are explicit positive integers", function()
    local cases = {
        { nil, "limits must be a table" },
        { {}, "maximum_width must be a positive integer" },
        { { maximum_width = 1 }, "maximum_height must be a positive integer" },
        { {
            maximum_width = 1,
            maximum_height = 1,
            maximum_pixels = 1,
            maximum_payload_bytes = 1,
            extra = true,
        }, "unknown field extra" },
    }
    for _, case in ipairs(cases) do
        local value, err = Pbm.decode("P4\n1 1\n\0", case[1])
        check.equal(value, nil)
        check.contains(err, case[2])
    end
    local value, err = Pbm.decode({}, LIMITS)
    check.equal(value, nil)
    check.contains(err, "input must be a string")
end }

return tests
