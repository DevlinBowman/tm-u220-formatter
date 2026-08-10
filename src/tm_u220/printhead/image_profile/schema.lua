-- Declares the canonical image-profile fields shared by parsing, validation, and editor presentation.
-- Returned descriptions are independent copies so callers cannot mutate the process-wide contract.
local M = {}

local VERSION = 1
local HEADER = "!tm-u220 image-profile " .. VERSION
local FIELDS = {
    { name = "density", kind = "enum", default = "solid",
        choices = { "solid", "detail" } },
    { name = "fit", kind = "enum", default = "contain",
        choices = { "contain", "cover", "stretch" } },
    { name = "resample", kind = "enum", default = "bilinear",
        choices = { "nearest", "area", "bilinear" } },
    { name = "dither", kind = "enum", default = "floyd",
        choices = { "threshold", "ordered", "floyd" } },
    { name = "threshold", kind = "integer", default = 128,
        minimum = 0, maximum = 255 },
    { name = "invert", kind = "boolean", default = false },
    { name = "unidirectional", kind = "boolean", default = true },
    { name = "trailing_gap_vertical_units", kind = "integer", default = 4,
        minimum = 0, maximum = 255 },
    { name = "default_width_cells", kind = "integer_or_keyword", default = "page",
        minimum = 1, keyword = "page" },
    { name = "default_height_cells", kind = "integer_or_keyword", default = "auto",
        minimum = 1, keyword = "auto" },
}

local function copy(value)
    if type(value) ~= "table" then return value end
    local result = {}
    for key, item in pairs(value) do result[key] = copy(item) end
    return result
end

function M.fields()
    return copy(FIELDS)
end

function M.describe()
    return {
        version = VERSION,
        header = HEADER,
        fields = M.fields(),
    }
end

M.VERSION = VERSION
M.HEADER = HEADER

return M
