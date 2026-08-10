-- Validates canonical schema values into an immutable, path-free printhead profile.
-- The schema owns field policy while this model owns effective profile identity and state.
local Schema = require("tm_u220.printhead.image_profile.schema")

local M = {}

local FIELDS = Schema.fields()
local BY_NAME = {}
for _, field in ipairs(FIELDS) do
    BY_NAME[field.name] = field
    if field.choices then
        field.accepted = {}
        for _, choice in ipairs(field.choices) do field.accepted[choice] = true end
    end
end

local STATE = setmetatable({}, { __mode = "k" })

local function integer(value)
    return type(value) == "number" and value >= math.mininteger
        and value <= math.maxinteger and value % 1 == 0
end

local function choice_text(choices)
    if #choices == 2 then return choices[1] .. " or " .. choices[2] end
    return table.concat(choices, ", ", 1, #choices - 1)
        .. ", or " .. choices[#choices]
end

local function validate(field, value)
    if field.kind == "enum" and not field.accepted[value] then
        return nil, field.name .. " must be " .. choice_text(field.choices)
    end
    if field.kind == "integer" and (not integer(value)
        or value < field.minimum or value > field.maximum) then
        return nil, string.format("%s must be an integer from %d through %d",
            field.name, field.minimum, field.maximum)
    end
    if field.kind == "boolean" and type(value) ~= "boolean" then
        return nil, field.name .. " must be boolean"
    end
    if field.kind == "integer_or_keyword" and value ~= field.keyword
        and (not integer(value) or value < field.minimum
            or (field.maximum and value > field.maximum)) then
        local range = field.maximum and string.format(
            "an integer from %d through %d", field.minimum, field.maximum)
            or "a positive integer"
        return nil, field.name .. " must be " .. range .. " or " .. field.keyword
    end
    return value
end

local METATABLE = {
    __index = function(value, key)
        local state = STATE[value]
        if key == "version" then return Schema.VERSION end
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
        if not BY_NAME[field] then
            return nil, "image profile has unknown field " .. tostring(field)
        end
    end

    local state = {}
    for _, field in ipairs(FIELDS) do
        local value = options[field.name]
        if value == nil then value = field.default end
        local validated, err = validate(field, value)
        if err then return nil, err end
        state[field.name] = validated
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
    for _, field in ipairs(FIELDS) do options[field.name] = profile[field.name] end
    return options
end

function M.fields()
    local fields = {}
    for index, field in ipairs(FIELDS) do fields[index] = field.name end
    return fields
end

M.VERSION = Schema.VERSION

return M
