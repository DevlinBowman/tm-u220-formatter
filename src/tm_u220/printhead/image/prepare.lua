-- Applies an image profile to one decoded source mask and returns printer-ready target dots.
-- Resource ceilings and the physical density grid are validated before any band packing occurs.
local Dither = require("tm_u220.printhead.image.dither")
local DotMask = require("tm_u220.printhead.dot_mask")
local Geometry = require("tm_u220.printhead.image.geometry")
local Grayscale = require("tm_u220.printhead.grayscale")
local ImageProfile = require("tm_u220.printhead.image_profile")
local Resample = require("tm_u220.printhead.image.resample")

local M = {}

local function positive_integer(value)
    return type(value) == "number" and value >= 1 and value % 1 == 0
end

function M.run(source, profile, options)
    if not DotMask.is(source) and not Grayscale.is(source) then
        return nil, "image source must be a dot mask or grayscale raster"
    end
    if not ImageProfile.is(profile) then return nil, "image profile is invalid" end
    if type(options) ~= "table" then return nil, "image preparation options must be a table" end
    local width = options.target_width_dots
    local height = options.target_height_dots
    local maximum_height = options.maximum_height_dots
    if not positive_integer(width) then return nil, "target image width must be positive" end
    if height ~= nil and not positive_integer(height) then
        return nil, "target image height must be positive or automatic"
    end
    if not positive_integer(maximum_height) then
        return nil, "maximum image height must be positive"
    end
    height = height or Geometry.auto_height(
        source.width, source.height, width, profile.density)
    if height > maximum_height then
        return nil, string.format("target image is %d dots high; maximum is %d",
            height, maximum_height)
    end

    local frame = Geometry.frame(source.width, source.height,
        width, height, profile.density, profile.fit)
    local pixels = Resample.run(source, width, height, frame,
        profile.resample, profile.invert)
    local mask, err = Dither.run(pixels, width, height,
        profile.dither, profile.threshold, profile.density == "detail")
    if not mask then return nil, err end
    return {
        mask = mask,
        width_dots = width,
        height_dots = height,
        frame = frame,
        density = profile.density,
        horizontal_density_dpi = Geometry.horizontal_dpi(profile.density),
        vertical_density_dpi = 72,
    }
end

return M
