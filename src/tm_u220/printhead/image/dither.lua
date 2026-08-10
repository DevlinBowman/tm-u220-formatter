-- Converts grayscale rows into a compact canonical dot mask with deterministic monochrome policies.
-- Detail density is made hardware-safe here by preventing horizontally adjacent strikes.
local DotMask = require("tm_u220.printhead.dot_mask")

local M = {}
local BAYER = {
    { 0, 8, 2, 10 }, { 12, 4, 14, 6 },
    { 3, 11, 1, 9 }, { 15, 7, 13, 5 },
}

local function clamp(value)
    return math.max(0, math.min(255, value))
end

local function decision(value, x, y, method, threshold)
    if method == "ordered" then
        local offset = (BAYER[(y - 1) % 4 + 1][(x - 1) % 4 + 1] - 7.5) * 16
        return value + offset < threshold
    end
    return value < threshold
end

local function packed_row(active, width)
    local bytes = {}
    for x = 1, width do
        local index = ((x - 1) // 8) + 1
        bytes[index] = bytes[index] or 0
        if active[x] then bytes[index] = bytes[index] | (0x80 >> ((x - 1) % 8)) end
    end
    return string.char(table.unpack(bytes))
end

function M.run(pixels, width, height, method, threshold, adjacency_safe)
    local packed, current_errors = {}, {}
    for y = 1, height do
        local active, next_errors = {}, {}
        local previous = false
        for x = 1, width do
            local value = clamp(pixels[y][x] + (current_errors[x] or 0))
            local strike = decision(value, x, y, method, threshold)
            if adjacency_safe and previous and strike then strike = false end
            active[x] = strike
            previous = strike
            if method == "floyd" then
                local error_value = value - (strike and 0 or 255)
                current_errors[x + 1] = (current_errors[x + 1] or 0)
                    + error_value * 7 / 16
                next_errors[x - 1] = (next_errors[x - 1] or 0)
                    + error_value * 3 / 16
                next_errors[x] = (next_errors[x] or 0) + error_value * 5 / 16
                next_errors[x + 1] = (next_errors[x + 1] or 0)
                    + error_value / 16
            end
        end
        packed[y] = packed_row(active, width)
        current_errors = next_errors
    end
    return DotMask.new({ width = width, height = height, data = table.concat(packed) })
end

return M
