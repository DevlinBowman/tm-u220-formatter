-- Owns mutable formatter measurements and printer-style state for one compilation.
-- Reset and line transitions also end any authored one-line code-page lock.
local M = {}

local function minimum_gap(profile)
    return profile.minimum_character_gap_half_dots
        or profile.character_spacing_half_dots
        or 0
end

local function default_tabs(profile)
    local font = profile.defaults.font
    local glyph = profile.fonts[font].matrix_width_half_dots
    local advance = glyph + minimum_gap(profile)
        + profile.defaults.character_spacing_half_dots
    local tabs = {}
    local position = advance * 8
    while position < profile.print_width_half_dots do
        tabs[#tabs + 1] = position
        position = position + advance * 8
    end
    return tabs
end

function M.reset(state)
    local defaults = state.profile.defaults
    state.font = defaults.font
    state.spacing = defaults.character_spacing_half_dots
    state.line_spacing = defaults.line_spacing_vertical_units
    state.emphasis = defaults.emphasis
    state.double_strike = defaults.double_strike
    state.double_width = defaults.double_width
    state.double_height = defaults.double_height
    state.underline = defaults.underline
    state.color = defaults.color
    state.justification = defaults.justification
    state.code_table = defaults.code_table
    state.code_table_lock = nil
    state.upside_down = defaults.upside_down
    state.used_half_dots = 0
    state.tabs = default_tabs(state.profile)
    return state
end

function M.new(profile)
    return M.reset({ profile = assert(profile) })
end

function M.character_advance(state)
    local glyph = state.profile.fonts[state.font].matrix_width_half_dots
    local advance = glyph + minimum_gap(state.profile) + state.spacing
    return state.double_width and advance * 2 or advance
end

function M.capacity(state)
    return math.floor(state.profile.print_width_half_dots / M.character_advance(state))
end

function M.remaining(state)
    local width = state.profile.print_width_half_dots - state.used_half_dots
    return math.max(0, math.floor(width / M.character_advance(state)))
end

function M.at_beginning(state)
    return state.used_half_dots == 0
end

function M.consume(state, characters)
    state.used_half_dots = state.used_half_dots
        + characters * M.character_advance(state)
end

function M.line_feed(state)
    state.used_half_dots = 0
    state.code_table_lock = nil
end

function M.horizontal_tab(state)
    for _, position in ipairs(state.tabs) do
        if position > state.used_half_dots then
            state.used_half_dots = position
            return true
        end
    end
    return false
end

return M
