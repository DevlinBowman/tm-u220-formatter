-- Owns an immutable row-major 8-bit luminance raster between image decoders and interpretation.
-- Zero is black and 255 is white; printer commands never enter this format-neutral boundary.
local M = {}
local STATE = setmetatable({}, { __mode = "k" })
local METHODS = {}

local function positive_integer(value)
    return type(value) == "number" and value >= 1 and value % 1 == 0
end

local function coordinate(value, maximum, label)
    if not positive_integer(value) or value > maximum then
        error(label .. " is outside the grayscale raster", 3)
    end
    return value
end

function METHODS:at(x, y)
    local state = STATE[self]
    if not state then error("value is not a grayscale raster", 2) end
    x = coordinate(x, state.width, "column")
    y = coordinate(y, state.height, "row")
    return state.data:byte((y - 1) * state.width + x)
end

function METHODS:row_data(y)
    local state = STATE[self]
    if not state then error("value is not a grayscale raster", 2) end
    y = coordinate(y, state.height, "row")
    local first = (y - 1) * state.width + 1
    return state.data:sub(first, first + state.width - 1)
end

local METATABLE = {
    __index = function(value, key)
        local state = STATE[value]
        if key == "width" then return state.width end
        if key == "height" then return state.height end
        if key == "data" then return state.data end
        return METHODS[key]
    end,
    __newindex = function() error("grayscale rasters are read-only", 2) end,
    __metatable = "tm_u220.printhead.grayscale",
}

function M.is(value)
    return type(value) == "table" and STATE[value] ~= nil
end

function M.new(options)
    if type(options) ~= "table" then return nil, "grayscale raster must be a table" end
    for key in pairs(options) do
        if key ~= "width" and key ~= "height" and key ~= "data" then
            return nil, "grayscale raster has unknown field " .. tostring(key)
        end
    end
    if not positive_integer(options.width) then
        return nil, "grayscale width must be a positive integer"
    end
    if not positive_integer(options.height) then
        return nil, "grayscale height must be a positive integer"
    end
    if type(options.data) ~= "string" then
        return nil, "grayscale data must be a string"
    end
    if options.width > math.maxinteger // options.height then
        return nil, "grayscale dimensions are too large"
    end
    local expected = options.width * options.height
    if #options.data ~= expected then
        return nil, string.format("grayscale data must contain exactly %d bytes", expected)
    end
    local value = setmetatable({}, METATABLE)
    STATE[value] = {
        width = options.width, height = options.height, data = options.data,
    }
    return value
end

return M
