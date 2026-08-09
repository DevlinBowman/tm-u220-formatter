-- Converts square source-image pixels into the asymmetric physical dot grid of a TM-U220 image mode.
-- It owns automatic height and contain/cover/stretch frame calculations, not raster sampling.
local M = {}

local HORIZONTAL_DPI = { solid = 80, detail = 160 }
local VERTICAL_DPI = 72

local function rounded(value)
    return math.max(1, math.floor(value + 0.5))
end

function M.auto_height(source_width, source_height, target_width, mode)
    local horizontal = assert(HORIZONTAL_DPI[mode], "unknown printhead density")
    return rounded(target_width * source_height * VERTICAL_DPI
        / (source_width * horizontal))
end

function M.frame(source_width, source_height, target_width, target_height, mode, fit)
    if fit == "stretch" then
        return { left = 0, top = 0, width = target_width, height = target_height }
    end
    local horizontal = assert(HORIZONTAL_DPI[mode], "unknown printhead density")
    local desired_ratio = source_width * horizontal / (source_height * VERTICAL_DPI)
    local target_ratio = target_width / target_height
    local width, height
    if (fit == "contain" and target_ratio > desired_ratio)
        or (fit == "cover" and target_ratio < desired_ratio) then
        height = target_height
        width = rounded(height * desired_ratio)
    else
        width = target_width
        height = rounded(width / desired_ratio)
    end
    return {
        left = math.floor((target_width - width) / 2),
        top = math.floor((target_height - height) / 2),
        width = width,
        height = height,
    }
end

function M.horizontal_dpi(mode)
    return HORIZONTAL_DPI[mode]
end

return M
