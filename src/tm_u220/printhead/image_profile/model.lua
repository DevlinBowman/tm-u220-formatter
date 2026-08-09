-- Validates image-interpretation choices into an immutable, path-free printhead profile.
-- This model owns artistic and image-layout defaults without importing receipt or printer configuration.
local M = {}

local VERSION = 1
local FIELD_ORDER = {
    "density",
    "fit",
    "resample",
    "dither",
    "threshold",
    "invert",
    "unidirectional",
    "trailing_gap_vertical_units",
    "default_width_cells",
    "default_height_cells",
}
local KNOWN_FIELDS = {}
for _, field in ipairs(FIELD_ORDER) do KNOWN_FIELDS[field] = true end

local DEFAULTS = {
    density = "solid",
    fit = "contain",
    resample = "nearest",
    dither = "threshold",
    threshold = 128,
    invert = false,
    unidirectional = true,
    trailing_gap_vertical_units = 4,
    default_width_cells = "page",
    default_height_cells = "auto",
}
local ENUMS = {
    density = { solid = true, detail = true },
    fit = { contain = true, cover = true, stretch = true },
    resample = { nearest = true, area = true, bilinear = true },
    dither = { threshold = true, ordered = true, floyd = true },
}
local ENUM_TEXT = {
    density = "solid or detail",
    fit = "contain, cover, or stretch",
    resample = "nearest, area, or bilinear",
    dither = "threshold, ordered, or floyd",
}

local STATE = setmetatable({}, { __mode = "k" })

local function integer(value)
    return type(value) == "number" and value >= math.mininteger
        and value <= math.maxinteger and value % 1 == 0
end

local function validate(field, value)
    local choices = ENUMS[field]
    if choices and not choices[value] then
        return nil, field .. " must be " .. ENUM_TEXT[field]
    end
    if field == "threshold" and (not integer(value) or value < 0 or value > 255) then
        return nil, "threshold must be an integer from 0 through 255"
    end
    if (field == "invert" or field == "unidirectional") and type(value) ~= "boolean" then
        return nil, field .. " must be boolean"
    end
    if field == "trailing_gap_vertical_units"
        and (not integer(value) or value < 0 or value > 255) then
        return nil, "trailing_gap_vertical_units must be an integer from 0 through 255"
    end
    if field == "default_width_cells"
        and value ~= "page" and (not integer(value) or value < 1) then
        return nil, "default_width_cells must be a positive integer or page"
    end
    if field == "default_height_cells"
        and value ~= "auto" and (not integer(value) or value < 1) then
        return nil, "default_height_cells must be a positive integer or auto"
    end
    return value
end

local METATABLE = {
    __index = function(value, key)
        local state = STATE[value]
        if key == "version" then return VERSION end
        if state then return state[key] end
    end,
    __newindex = function()
        error("image profiles are read-only", 2)
    end,
    __metatable = "tm_u220.printhead.image_profile",
}

function M.is(value)
    return type(value) == "table" and STATE[value] ~= nil
end

function M.new(options)
    if options == nil then options = {} end
    if type(options) ~= "table" then return nil, "image profile must be a table" end
    for field in pairs(options) do
        if not KNOWN_FIELDS[field] then
            return nil, "image profile has unknown field " .. tostring(field)
        end
    end

    local state = {}
    for _, field in ipairs(FIELD_ORDER) do
        local value = options[field]
        if value == nil then value = DEFAULTS[field] end
        local validated, err = validate(field, value)
        if err then return nil, err end
        state[field] = validated
    end
    local profile = setmetatable({}, METATABLE)
    STATE[profile] = state
    return profile
end

function M.defaults()
    return assert(M.new())
end

function M.options(profile)
    if not M.is(profile) then return nil, "value is not an image profile" end
    local options = {}
    for _, field in ipairs(FIELD_ORDER) do options[field] = profile[field] end
    return options
end

function M.fields()
    local fields = {}
    for index, field in ipairs(FIELD_ORDER) do fields[index] = field end
    return fields
end

M.VERSION = VERSION

return M
