-- Samples a canonical one-bit source mask into a grayscale target frame.
-- Fit geometry, interpolation, and inversion are resolved here before monochrome dithering.
local M = {}
local Grayscale = require("tm_u220.printhead.grayscale")

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function value_at(mask, x, y, invert)
    x = clamp(x, 1, mask.width)
    y = clamp(y, 1, mask.height)
    local sample = mask:at(x, y)
    local value = Grayscale.is(mask) and sample or (sample and 0 or 255)
    return invert and 255 - value or value
end

local function source_coordinate(position, frame_start, frame_size, source_size)
    return ((position - 0.5 - frame_start) / frame_size) * source_size + 0.5
end

local function nearest(mask, x, y, frame, invert)
    local source_x = source_coordinate(x, frame.left, frame.width, mask.width)
    local source_y = source_coordinate(y, frame.top, frame.height, mask.height)
    return value_at(mask, math.floor(source_x + 0.5), math.floor(source_y + 0.5), invert)
end

local function bilinear(mask, x, y, frame, invert)
    local source_x = source_coordinate(x, frame.left, frame.width, mask.width)
    local source_y = source_coordinate(y, frame.top, frame.height, mask.height)
    local left, top = math.floor(source_x), math.floor(source_y)
    local fx, fy = source_x - left, source_y - top
    local a = value_at(mask, left, top, invert)
    local b = value_at(mask, left + 1, top, invert)
    local c = value_at(mask, left, top + 1, invert)
    local d = value_at(mask, left + 1, top + 1, invert)
    return (a * (1 - fx) + b * fx) * (1 - fy)
        + (c * (1 - fx) + d * fx) * fy
end

local function area(mask, x, y, frame, invert)
    local x0 = (x - 1 - frame.left) * mask.width / frame.width
    local x1 = (x - frame.left) * mask.width / frame.width
    local y0 = (y - 1 - frame.top) * mask.height / frame.height
    local y1 = (y - frame.top) * mask.height / frame.height
    local total, weight = 0, 0
    for source_y = math.floor(y0) + 1, math.ceil(y1) do
        local vertical = math.max(0, math.min(y1, source_y)
            - math.max(y0, source_y - 1))
        for source_x = math.floor(x0) + 1, math.ceil(x1) do
            local horizontal = math.max(0, math.min(x1, source_x)
                - math.max(x0, source_x - 1))
            local portion = horizontal * vertical
            total = total + value_at(mask, source_x, source_y, invert) * portion
            weight = weight + portion
        end
    end
    return weight > 0 and total / weight or 255
end

local SAMPLERS = { nearest = nearest, bilinear = bilinear, area = area }

function M.run(mask, width, height, frame, method, invert)
    local sample = assert(SAMPLERS[method], "unknown image resampler")
    local pixels = {}
    for y = 1, height do
        local row = {}
        for x = 1, width do
            local inside = x - 1 >= frame.left and x - 1 < frame.left + frame.width
                and y - 1 >= frame.top and y - 1 < frame.top + frame.height
            row[x] = inside and sample(mask, x, y, frame, invert) or 255
        end
        pixels[y] = row
    end
    return pixels
end

return M
