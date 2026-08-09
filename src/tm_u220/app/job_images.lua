-- Orchestrates one materialized image through physical sizing, raster interpretation, preview, and ESC/POS bands.
-- Printhead algorithms and formatter state remain sibling domains joined only at this application boundary.
local BitImage = require("tm_u220.printhead.bit_image")
local Prepare = require("tm_u220.printhead.image.prepare")
local state_api = require("tm_u220.format.state")

local M = {}
local MAXIMUM_HEIGHT_DOTS = 2048
local COLUMN_STEP = { solid = 2, detail = 1 }

local function compact_hex(value)
    local out = {}
    for index = 1, #value do out[index] = string.format("%02X", value:byte(index)) end
    return table.concat(out)
end

local function cell_height(context)
    local font = context.profile.fonts[context.state.font] or {}
    local height = font.character_cell_height_vertical_units
        or (font.matrix_height_dots or 9) * 2
    return context.state.double_height and height * 2 or height
end

local function target_dimensions(context, operation, image_profile)
    local step = COLUMN_STEP[image_profile.density]
    local width_cells = operation.width_cells or image_profile.default_width_cells
    local height_cells = operation.height_cells or image_profile.default_height_cells
    local width_half_dots = width_cells == "page"
        and context.profile.print_width_half_dots
        or width_cells * state_api.character_advance(context.state)
    if width_half_dots > context.profile.print_width_half_dots then
        return nil, string.format("@image box is %d half-dots wide; printable width is %d",
            width_half_dots, context.profile.print_width_half_dots)
    end
    local width_dots = math.floor(width_half_dots / step)
    local height_dots
    if height_cells ~= "auto" then
        height_dots = math.floor(height_cells * cell_height(context) / 2)
    end
    return {
        width_dots = width_dots,
        height_dots = height_dots,
        column_step_half_dots = step,
        maximum_columns = math.floor(context.profile.print_width_half_dots / step),
    }
end

function M.handle(context, operation, image_profile)
    if operation.kind ~= "image" then return false end
    if not context:require_beginning("@image", operation.span) then return true end
    if not operation.source_raster then
        context:add_diagnostic("FORMAT_IMAGE_SOURCE_MISSING",
            "@image source was not materialized before formatting", operation.span)
        return true
    end
    local target, target_failure = target_dimensions(context, operation, image_profile)
    if not target then
        context:add_diagnostic("FORMAT_IMAGE_BOX_INVALID", target_failure, operation.span)
        return true
    end
    local prepared, prepare_failure = Prepare.run(operation.source_raster, image_profile, {
        target_width_dots = target.width_dots,
        target_height_dots = target.height_dots,
        maximum_height_dots = MAXIMUM_HEIGHT_DOTS,
    })
    if not prepared then
        context:add_diagnostic("FORMAT_IMAGE_INTERPRETATION_FAILED",
            prepare_failure, operation.span)
        return true
    end
    local packed, pack_failure = BitImage.pack(prepared.mask, {
        mode = image_profile.density,
        maximum_columns = target.maximum_columns,
    })
    if not packed then
        context:add_diagnostic("FORMAT_IMAGE_PACK_FAILED", pack_failure, operation.span)
        return true
    end

    local preview_line = context:add_image_preview({
        label = operation.path,
        reference = operation.path,
        density = image_profile.density,
        mask_encoding = "hex-msb-rows",
        mask_data = compact_hex(prepared.mask.data),
        mask_width_dots = prepared.mask.width,
        mask_height_dots = prepared.mask.height,
        column_step_half_dots = target.column_step_half_dots,
    }, operation.span)
    context:begin_printhead_output()
    if image_profile.unidirectional then
        context:command("printhead.unidirectional", { enabled = true })
    end
    for index, band in ipairs(packed.bands) do
        context:printhead_band(band.command_args, band.feed_vertical_units,
            "image_band", operation.span, index == 1 and preview_line or nil)
    end
    if image_profile.trailing_gap_vertical_units > 0 then
        context:printhead_feed(image_profile.trailing_gap_vertical_units,
            "image_trailing_gap", operation.span)
    end
    if image_profile.unidirectional then
        context:command("printhead.unidirectional", { enabled = false })
    end
    return true
end

return M
