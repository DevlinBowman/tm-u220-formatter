-- Decodes one strict binary PBM image into the canonical printhead dot mask.
-- It owns format validation and caller-supplied resource limits, but performs no file or layout work.
local DotMask = require("tm_u220.printhead.dot_mask")

local M = {}

local LIMIT_FIELDS = {
    "maximum_width",
    "maximum_height",
    "maximum_pixels",
    "maximum_payload_bytes",
}

local function positive_integer(value)
    return type(value) == "number" and value >= 1
        and value <= math.maxinteger and value % 1 == 0
end

local function limits_for(value)
    if type(value) ~= "table" then return nil, "binary PBM limits must be a table" end
    local allowed = {}
    for _, name in ipairs(LIMIT_FIELDS) do allowed[name] = true end
    for key in pairs(value) do
        if not allowed[key] then
            return nil, "binary PBM limits have unknown field " .. tostring(key)
        end
    end
    local limits = {}
    for _, name in ipairs(LIMIT_FIELDS) do
        if not positive_integer(value[name]) then
            return nil, "binary PBM " .. name .. " must be a positive integer"
        end
        limits[name] = value[name]
    end
    return limits
end

local function is_whitespace(byte)
    return byte == 32 or (byte and byte >= 9 and byte <= 13)
end

local function skip_comment(source, position)
    position = position + 1
    while position <= #source do
        local byte = source:byte(position)
        if byte == 10 or byte == 13 then break end
        position = position + 1
    end
    return position
end

local function skip_separators(source, position, label)
    local separated = false
    while position <= #source do
        local byte = source:byte(position)
        if is_whitespace(byte) then
            separated = true
            position = position + 1
        elseif byte == 35 then
            separated = true
            position = skip_comment(source, position)
        else
            break
        end
    end
    if not separated then return nil, "binary PBM " .. label .. " must be separated" end
    return position
end

local function read_dimension(source, position, label, maximum)
    local byte = source:byte(position)
    if not byte or byte < 48 or byte > 57 then
        return nil, "binary PBM " .. label .. " must be a positive decimal integer"
    end
    local value = 0
    while position <= #source do
        byte = source:byte(position)
        if byte < 48 or byte > 57 then break end
        local digit = byte - 48
        if value > (maximum - digit) // 10 then
            return nil, string.format("binary PBM %s exceeds maximum %d", label, maximum)
        end
        value = value * 10 + digit
        position = position + 1
    end
    if value == 0 then
        return nil, "binary PBM " .. label .. " must be a positive decimal integer"
    end
    byte = source:byte(position)
    if byte and not is_whitespace(byte) and byte ~= 35 then
        return nil, "binary PBM " .. label .. " must contain only decimal digits"
    end
    return value, position
end

local function raster_position(source, position)
    -- A height-adjacent comment ends before CR/LF; that single byte is the raster delimiter.
    -- Nothing after the delimiter is skipped because every possible byte is valid raster data.
    if source:byte(position) == 35 then position = skip_comment(source, position) end
    if not is_whitespace(source:byte(position)) then
        return nil, "binary PBM height must be followed by one whitespace byte"
    end
    return position + 1
end

function M.decode(source, options)
    if type(source) ~= "string" then return nil, "binary PBM input must be a string" end
    local limits, err = limits_for(options)
    if not limits then return nil, err end
    if source:sub(1, 2) ~= "P4" then
        return nil, "binary PBM magic must be P4"
    end

    local position
    position, err = skip_separators(source, 3, "magic and width")
    if not position then return nil, err end
    local width
    width, position = read_dimension(source, position, "width", limits.maximum_width)
    if not width then return nil, position end
    position, err = skip_separators(source, position, "width and height")
    if not position then return nil, err end
    local height
    height, position = read_dimension(source, position, "height", limits.maximum_height)
    if not height then return nil, position end

    if width > limits.maximum_pixels // height then
        return nil, string.format("binary PBM dimensions exceed maximum %d pixels",
            limits.maximum_pixels)
    end
    local stride = ((width - 1) // 8) + 1
    if stride > limits.maximum_payload_bytes // height then
        return nil, string.format("binary PBM raster exceeds maximum %d bytes",
            limits.maximum_payload_bytes)
    end
    local expected = stride * height

    position, err = raster_position(source, position)
    if not position then return nil, err end
    local actual = #source - position + 1
    if actual ~= expected then
        return nil, string.format("binary PBM raster must contain exactly %d bytes; got %d",
            expected, actual)
    end
    return DotMask.new({
        width = width,
        height = height,
        data = source:sub(position),
    })
end

return M
