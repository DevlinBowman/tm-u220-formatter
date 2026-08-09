-- Owns the compact, read-only dot mask exchanged between image preparation and printhead encoders.
-- Its row-major bytes match binary PBM packing: most-significant bit first with zero row padding.
local M = {}

local STATE = setmetatable({}, { __mode = "k" })
local METHODS = {}

local function positive_integer(value)
    return type(value) == "number" and value >= 1
        and value <= math.maxinteger and value % 1 == 0
end

local function dense_size(values, label)
    if type(values) ~= "table" then return nil, label .. " must be a dense array" end
    local count, maximum = 0, 0
    for key in pairs(values) do
        if type(key) ~= "number" or key < 1 or key > math.maxinteger or key % 1 ~= 0 then
            return nil, label .. " must be a dense array"
        end
        count = count + 1
        maximum = math.max(maximum, key)
    end
    if maximum ~= count then return nil, label .. " must be a dense array" end
    return count
end

local function state_for(value)
    local state = type(value) == "table" and STATE[value] or nil
    if not state then error("value is not a dot mask", 3) end
    return state
end

local function coordinate(value, maximum, label)
    if not positive_integer(value) or value > maximum then
        error(label .. " is outside the dot mask", 3)
    end
    return value
end

function METHODS:at(x, y)
    local state = state_for(self)
    x = coordinate(x, state.width, "column")
    y = coordinate(y, state.height, "row")
    local offset = (y - 1) * state.stride + ((x - 1) // 8) + 1
    local bit = 0x80 >> ((x - 1) % 8)
    return (state.data:byte(offset) & bit) ~= 0
end

function METHODS:row_data(y)
    local state = state_for(self)
    y = coordinate(y, state.height, "row")
    local first = (y - 1) * state.stride + 1
    return state.data:sub(first, first + state.stride - 1)
end

function METHODS:first_horizontal_adjacency()
    local state = state_for(self)
    for y = 1, state.height do
        local previous = false
        for x = 1, state.width do
            local offset = (y - 1) * state.stride + ((x - 1) // 8) + 1
            local active = (state.data:byte(offset) & (0x80 >> ((x - 1) % 8))) ~= 0
            if previous and active then return x - 1, y end
            previous = active
        end
    end
    return nil
end

local METATABLE = {
    __index = function(value, key)
        local state = STATE[value]
        if key == "width" then return state.width end
        if key == "height" then return state.height end
        if key == "row_stride_bytes" then return state.stride end
        if key == "data" then return state.data end
        return METHODS[key]
    end,
    __newindex = function()
        error("dot masks are read-only", 2)
    end,
    __metatable = "tm_u220.printhead.dot_mask",
}

function M.is(value)
    return type(value) == "table" and STATE[value] ~= nil
end

function M.new(options)
    if type(options) ~= "table" then return nil, "dot mask must be a table" end
    for key in pairs(options) do
        if key ~= "width" and key ~= "height" and key ~= "data" then
            return nil, "dot mask has unknown field " .. tostring(key)
        end
    end
    if not positive_integer(options.width) then
        return nil, "dot mask width must be a positive integer"
    end
    if not positive_integer(options.height) then
        return nil, "dot mask height must be a positive integer"
    end
    if type(options.data) ~= "string" then return nil, "dot mask data must be a string" end

    local stride = ((options.width - 1) // 8) + 1
    if stride > math.maxinteger // options.height then return nil, "dot mask dimensions are too large" end
    local expected = stride * options.height
    if #options.data ~= expected then
        return nil, string.format("dot mask data must contain exactly %d bytes", expected)
    end

    local remainder = options.width % 8
    if remainder ~= 0 then
        local padding_mask = (1 << (8 - remainder)) - 1
        for row = 1, options.height do
            if (options.data:byte(row * stride) & padding_mask) ~= 0 then
                return nil, "dot mask row padding bits must be zero"
            end
        end
    end

    local value = setmetatable({}, METATABLE)
    STATE[value] = {
        width = options.width,
        height = options.height,
        stride = stride,
        data = options.data,
    }
    return value
end

function M.from_rows(rows)
    local height, err = dense_size(rows, "dot mask rows")
    if not height or height == 0 then return nil, err or "dot mask rows cannot be empty" end
    local width
    local packed = {}
    for y = 1, height do
        local count
        count, err = dense_size(rows[y], "dot mask row " .. y)
        if not count then return nil, err end
        if y == 1 then
            if count == 0 then return nil, "dot mask rows cannot be empty" end
            width = count
        elseif count ~= width then
            return nil, "dot mask rows must have equal widths"
        end

        local bytes = {}
        for x = 1, width do
            if type(rows[y][x]) ~= "boolean" then
                return nil, string.format("dot mask row %d column %d must be boolean", y, x)
            end
            local byte_index = ((x - 1) // 8) + 1
            bytes[byte_index] = bytes[byte_index] or 0
            if rows[y][x] then bytes[byte_index] = bytes[byte_index] | (0x80 >> ((x - 1) % 8)) end
        end
        packed[y] = string.char(table.unpack(bytes))
    end
    return M.new({ width = width, height = height, data = table.concat(packed) })
end

return M
