-- Verifies decoder-facing grayscale rasters preserve exact immutable luminance bytes.
-- Coordinate access supplies the same source contract consumed by image resampling.
local check = require("unit.support")
local Grayscale = require("tm_u220.printhead.grayscale")

local tests = {}

tests[#tests + 1] = { "grayscale bytes expose exact coordinates and rows", function()
    local raster = assert(Grayscale.new({
        width = 2, height = 2, data = string.char(0, 64, 128, 255),
    }))
    check.truthy(Grayscale.is(raster))
    check.equal(raster:at(1, 1), 0)
    check.equal(raster:at(2, 2), 255)
    check.equal(raster:row_data(2), string.char(128, 255))
    check.equal(pcall(function() raster.width = 9 end), false)
end }

tests[#tests + 1] = { "grayscale construction rejects malformed shapes", function()
    local cases = {
        { nil, "must be a table" },
        { {}, "width must be a positive integer" },
        { { width = 1, height = 1, data = "", extra = true }, "unknown field" },
        { { width = 2, height = 2, data = "abc" }, "exactly 4 bytes" },
    }
    for _, case in ipairs(cases) do
        local value, err = Grayscale.new(case[1])
        check.equal(value, nil)
        check.contains(err, case[2])
    end
end }

return tests
