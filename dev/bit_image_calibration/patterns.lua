-- Defines synthetic masks that make TM-U220 pin order, density safety, and band registration visible.
-- The fixtures contain only logical dots; canonical printhead modules own all packing and commands.
local DotMask = require("tm_u220.printhead.dot_mask")

local M = {}

local function make_mask(width, height, active)
    local rows = {}
    for y = 1, height do
        local row = {}
        for x = 1, width do row[x] = active(x, y) end
        rows[y] = row
    end
    return assert(DotMask.from_rows(rows))
end

function M.all()
    return {
        {
            id = "bit_order",
            label = "1 BIT ORDER (80 TO 01)",
            expectation = "EXPECT STAIRCASE DOWN TO THE RIGHT",
            mode = "solid",
            mask = make_mask(32, 8, function(x, y)
                return x > (y - 1) * 4 and x <= y * 4
            end),
        },
        {
            id = "single_density_solid",
            label = "2 M=0 SOLID",
            expectation = "EXPECT ONE FILLED RECTANGLE",
            mode = "solid",
            mask = make_mask(64, 8, function() return true end),
        },
        {
            id = "double_density_alternation",
            label = "3 M=1 SAFE ALTERNATION",
            expectation = "EXPECT EVEN CHECKERBOARD",
            mode = "detail",
            mask = make_mask(96, 8, function(x, y)
                return (x + y) % 2 == 0
            end),
        },
        {
            id = "two_band_registration",
            label = "4 TWO-BAND REGISTRATION",
            expectation = "EXPECT 4 STRAIGHT VERTICAL RAILS",
            mode = "solid",
            unidirectional = true,
            mask = make_mask(96, 16, function(x, y)
                return y == 1 or y == 16
                    or x == 1 or x == 32 or x == 64 or x == 96
            end),
        },
    }
end

return M
