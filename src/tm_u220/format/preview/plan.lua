-- Records compiler-owned line geometry, paper motion, cuts, and source spans for preview consumers.
local state_api = require("tm_u220.format.state")

local Plan = {}
Plan.__index = Plan

local function style_snapshot(state)
    return {
        font = state.font,
        emphasis = state.emphasis,
        double_strike = state.double_strike,
        double_width = state.double_width,
        double_height = state.double_height,
        underline = state.underline,
        color = state.color,
        upside_down = state.upside_down,
    }
end

local function cell_height(profile, style)
    style = style or {}
    local font = profile.fonts[style.font or profile.defaults.font] or {}
    local height = font.character_cell_height_vertical_units
        or (font.matrix_height_dots or 0) * 2
    return style.double_height and height * 2 or height
end

local function glyph_height(segments)
    local height = 0
    for _, segment in ipairs(segments) do
        height = math.max(height, segment.character_cell_height_vertical_units or 0)
    end
    return height
end

local function minimum_gap(profile)
    return profile.minimum_character_gap_half_dots
        or profile.character_spacing_half_dots
        or 0
end

local function line_advance(profile, spacing, height)
    local default_font = profile.fonts[profile.defaults.font] or {}
    local normal_height = default_font.character_cell_height_vertical_units
        or (default_font.matrix_height_dots or 0) * 2
    return spacing + math.max(0, height - normal_height)
end

local function justified_offset(profile, justification, content_width)
    local available = math.max(0, profile.print_width_half_dots - content_width)
    if justification == "right" then return available end
    if justification == "center" then return math.floor(available / 2) end
    return 0
end

function Plan.new(profile)
    return setmetatable({
        profile = profile,
        lines = {},
        segments = {},
        events = {},
        y = 0,
        min_y = 0,
        max_y = 0,
    }, Plan)
end

function Plan:empty()
    return #self.segments == 0
end

function Plan:add_text(value, state, span, cells, code_page, resident_bytes)
    cells = cells or #value
    resident_bytes = resident_bytes or ""
    local advance = state_api.character_advance(state)
    local gap = minimum_gap(self.profile)
    local font = self.profile.fonts[state.font] or {}
    local style = style_snapshot(state)
    self.segments[#self.segments + 1] = {
        text = value,
        code_page = code_page,
        resident_bytes = { resident_bytes:byte(1, -1) },
        style = style,
        source_span = span,
        x_half_dots = state.used_half_dots,
        width_half_dots = cells * advance,
        character_advance_half_dots = advance,
        character_spacing_half_dots = state.spacing,
        additional_character_spacing_half_dots = state.spacing,
        minimum_character_gap_half_dots = gap,
        effective_character_gap_half_dots = gap + state.spacing,
        glyph_width_half_dots = font.matrix_width_half_dots,
        character_cell_height_vertical_units = cell_height(
            self.profile, style),
    }
end

function Plan:add_tab(before, distance, columns, state, span)
    local gap = minimum_gap(self.profile)
    self.segments[#self.segments + 1] = {
        text = (" "):rep(columns),
        style = style_snapshot(state),
        source_span = span,
        x_half_dots = before,
        width_half_dots = distance,
        character_advance_half_dots = state_api.character_advance(state),
        character_spacing_half_dots = state.spacing,
        additional_character_spacing_half_dots = state.spacing,
        minimum_character_gap_half_dots = gap,
        effective_character_gap_half_dots = gap + state.spacing,
        character_cell_height_vertical_units = 0,
        preview_only = true,
    }
end

function Plan:add_image(image, state, justification, span)
    local width = image.mask_width_dots * image.column_step_half_dots
    local height = image.mask_height_dots * 2
    local segment = {
        kind = "bit_image",
        label = image.label,
        reference = image.reference,
        density = image.density,
        mask_encoding = image.mask_encoding,
        mask_data = image.mask_data,
        mask_width_dots = image.mask_width_dots,
        mask_height_dots = image.mask_height_dots,
        column_step_half_dots = image.column_step_half_dots,
        x_half_dots = 0,
        width_half_dots = width,
        character_cell_height_vertical_units = height,
        style = { color = state.color, upside_down = state.upside_down },
        source_span = span,
    }
    local line = {
        kind = "image",
        text = "[image " .. tostring(image.label) .. "]",
        image_label = image.label,
        image_density = image.density,
        segments = { segment },
        justification = justification,
        reason = "image",
        source_span = span,
        y_vertical_units = self.y,
        content_width_half_dots = width,
        x_offset_half_dots = justified_offset(self.profile, justification, width),
        line_spacing_vertical_units = 0,
        glyph_height_vertical_units = height,
        line_advance_vertical_units = height,
    }
    self.lines[#self.lines + 1] = line
    self.events[#self.events + 1] = {
        kind = "line", line_index = #self.lines, y_vertical_units = self.y,
        source_span = span,
    }
    self.max_y = math.max(self.max_y, self.y + height)
    return #self.lines
end

function Plan:finish_line(state, justification, reason, include_empty, span)
    if not include_empty and self:empty() then return false end
    local text = {}
    for index, segment in ipairs(self.segments) do text[index] = segment.text end
    local height = glyph_height(self.segments)
    local line = {
        text = table.concat(text),
        segments = self.segments,
        justification = justification,
        reason = reason or "explicit",
        source_span = span or (self.segments[1] and self.segments[1].source_span),
        y_vertical_units = self.y,
        content_width_half_dots = state.used_half_dots,
        x_offset_half_dots = justified_offset(
            self.profile, justification, state.used_half_dots),
        line_spacing_vertical_units = state.line_spacing,
        glyph_height_vertical_units = height,
        line_advance_vertical_units = line_advance(
            self.profile, state.line_spacing, height),
    }
    self.lines[#self.lines + 1] = line
    self.events[#self.events + 1] = {
        kind = "line", line_index = #self.lines, y_vertical_units = line.y_vertical_units,
    }
    self.max_y = math.max(self.max_y,
        self.y + line.line_advance_vertical_units)
    self.segments = {}
    return line
end

function Plan:move(vertical_units, reason, span, details)
    local from = self.y
    self.y = from + vertical_units
    self.min_y = math.min(self.min_y, self.y)
    self.max_y = math.max(self.max_y, self.y)
    local event = {
        kind = "motion",
        reason = reason,
        source_span = span,
        from_y_vertical_units = from,
        to_y_vertical_units = self.y,
        vertical_units = vertical_units,
    }
    if details then
        event.commanded_vertical_units = details.commanded_vertical_units
        event.reverse_vertical_units = details.reverse_vertical_units
        event.recovery_vertical_units = details.recovery_vertical_units
    end
    self.events[#self.events + 1] = event
end

function Plan:add_cut(shape, span)
    self.events[#self.events + 1] = {
        kind = "cut", shape = shape, source_span = span, y_vertical_units = self.y,
    }
end

function Plan:reset_line()
    self.segments = {}
end

function Plan:result()
    return {
        events = self.events,
        min_y_vertical_units = self.min_y,
        max_y_vertical_units = self.max_y,
    }
end

return Plan
