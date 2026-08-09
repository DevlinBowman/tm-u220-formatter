-- Converts a compact printhead dot mask into the TM-U220's eight-row bit-image bands.
-- It owns physical density limits and rejects horizontally adjacent detail-mode strikes before bytes are emitted.
local DotMask = require("tm_u220.printhead.dot_mask")

local M = {}

local BAND_HEIGHT_DOTS = 8
local FEED_VERTICAL_UNITS = 16
local MODES = {
    solid = {
        command_mode = "single_density",
        horizontal_dpi = 80,
        column_step_half_dots = 2,
        maximum_columns = 200,
        prohibits_adjacency = false,
    },
    detail = {
        command_mode = "double_density",
        horizontal_dpi = 160,
        column_step_half_dots = 1,
        maximum_columns = 400,
        prohibits_adjacency = true,
    },
}

local function positive_integer(value)
    return type(value) == "number" and value >= 1
        and value <= math.maxinteger and value % 1 == 0
end

local function options_for(value)
    if value == nil then value = {} end
    if type(value) ~= "table" then return nil, "bit-image options must be a table" end
    for key in pairs(value) do
        if key ~= "mode" and key ~= "maximum_columns" then
            return nil, "bit-image options have unknown field " .. tostring(key)
        end
    end
    local name = value.mode
    if name == nil then name = "solid" end
    local mode = MODES[name]
    if not mode then return nil, "bit-image mode must be solid or detail" end
    local maximum = value.maximum_columns
    if maximum == nil then maximum = mode.maximum_columns end
    if not positive_integer(maximum) or maximum > mode.maximum_columns then
        return nil, string.format("%s maximum_columns must be from 1 through %d",
            name, mode.maximum_columns)
    end
    return name, mode, maximum
end

local function pack_band(mask, first_row)
    local out = {}
    for column = 1, mask.width do
        local byte = 0
        for offset = 0, BAND_HEIGHT_DOTS - 1 do
            local row = first_row + offset
            if row <= mask.height and mask:at(column, row) then
                byte = byte | (0x80 >> offset)
            end
        end
        out[column] = string.char(byte)
    end
    return table.concat(out)
end

function M.pack(mask, options)
    if not DotMask.is(mask) then return nil, "bit-image input must be a dot mask" end
    local name, mode, maximum = options_for(options)
    if not name then return nil, mode end
    if mask.width > maximum then
        return nil, string.format("%s bit image is %d columns wide; maximum is %d",
            name, mask.width, maximum)
    end
    if mode.prohibits_adjacency then
        local column, row = mask:first_horizontal_adjacency()
        if column then
            return nil, string.format(
                "detail mode prohibits adjacent dots at row %d, columns %d and %d",
                row, column, column + 1)
        end
    end

    local band_count = (mask.height + BAND_HEIGHT_DOTS - 1) // BAND_HEIGHT_DOTS
    local bands = {}
    for index = 1, band_count do
        local first_row = (index - 1) * BAND_HEIGHT_DOTS + 1
        local row_count = math.min(BAND_HEIGHT_DOTS, mask.height - first_row + 1)
        local data = pack_band(mask, first_row)
        bands[index] = {
            index = index,
            row_first = first_row,
            row_count = row_count,
            feed_vertical_units = FEED_VERTICAL_UNITS,
            command_args = {
                mode = mode.command_mode,
                width_dots = mask.width,
                data = data,
            },
        }
    end

    return {
        mode = name,
        command_mode = mode.command_mode,
        horizontal_density_dpi = mode.horizontal_dpi,
        vertical_density_dpi = 72,
        column_step_half_dots = mode.column_step_half_dots,
        width_dots = mask.width,
        height_dots = mask.height,
        printed_height_dots = band_count * BAND_HEIGHT_DOTS,
        band_height_dots = BAND_HEIGHT_DOTS,
        feed_vertical_units_per_band = FEED_VERTICAL_UNITS,
        bands = bands,
    }
end

return M
