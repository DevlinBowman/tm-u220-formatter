-- Resolves independently aligned table column groups into full-line printer-cell geometry.
-- It also snapshots the horizontal printer state that every row in the block must retain.
local state_api = require("tm_u220.format.state")

local M = {}

local ALIGNMENTS = {
    L = "left", l = "left", left = "left",
    C = "center", c = "center", center = "center",
    R = "right", r = "right", right = "right",
}

local TABLE_ALIGNMENTS = {
    L = "left", l = "left", left = "left",
    R = "right", r = "right", right = "right",
}

local SIGNATURE_FIELDS = {
    { key = "print_width_half_dots", label = "printable width" },
    { key = "character_advance_half_dots", label = "character advance" },
    { key = "capacity", label = "line capacity" },
    { key = "justification", label = "line justification" },
    { key = "upside_down", label = "upside-down mode" },
}

local function fail(context, code, message, span)
    context:add_diagnostic(code, message, span)
    return nil
end

local function whole_positive(value)
    return type(value) == "number" and value >= 1
        and value <= math.maxinteger and value % 1 == 0
end

function M.horizontal_signature(context)
    local state = context.state
    return {
        print_width_half_dots = context.profile.print_width_half_dots,
        character_advance_half_dots = state_api.character_advance(state),
        capacity = state_api.capacity(state),
        justification = state.justification,
        upside_down = state.upside_down,
    }
end

function M.horizontal_change(resolved, context)
    local current = M.horizontal_signature(context)
    for _, field in ipairs(SIGNATURE_FIELDS) do
        local expected = resolved.signature[field.key]
        local actual = current[field.key]
        if expected ~= actual then
            return field.label, expected, actual
        end
    end
    return nil
end

local function resolve_columns(context, operation, table_alignment, capacity)
    local authored = operation.columns
    if type(authored) ~= "table" or #authored == 0 then
        return fail(context, "FORMAT_TABLE_COLUMNS",
            "@table requires one or more columns", operation.span)
    end

    local columns = {}
    local group_cells = { left = 0, right = 0 }
    local group_counts = { left = 0, right = 0 }
    local right_seen = false
    for index, column in ipairs(authored) do
        local width = type(column) == "table" and column.width or nil
        local content = type(column) == "table"
            and ALIGNMENTS[column.content_alignment] or nil
        local group = type(column) == "table"
            and TABLE_ALIGNMENTS[column.group_alignment or table_alignment] or nil
        if not whole_positive(width) then
            return fail(context, "FORMAT_TABLE_COLUMN_WIDTH", string.format(
                "@table column %d width must be a positive whole number of cells",
                index), operation.span)
        end
        if not content then
            return fail(context, "FORMAT_TABLE_COLUMN_ALIGNMENT", string.format(
                "@table column %d content alignment must be L, C, or R", index),
                operation.span)
        end
        if not group then
            return fail(context, "FORMAT_TABLE_COLUMN_GROUP", string.format(
                "@table column %d group alignment must be L or R", index),
                operation.span)
        end
        if group == "right" then
            right_seen = true
        elseif right_seen then
            return fail(context, "FORMAT_TABLE_GROUP_ORDER",
                "@table left-group columns must precede right-group columns",
                operation.span)
        end

        columns[index] = {
            cells = width,
            content_alignment = content,
            group_alignment = group,
        }
        if group_counts[group] > 0 then
            group_cells[group] = group_cells[group] + 1
        end
        group_cells[group] = group_cells[group] + width
        group_counts[group] = group_counts[group] + 1
        if group_cells[group] > capacity then
            return fail(context, "FORMAT_TABLE_TOO_WIDE", string.format(
                "@table %s-group columns exceed the current %d-cell capacity",
                group, capacity), operation.span)
        end
    end
    return columns, group_cells, group_counts
end

function M.resolve(context, operation)
    local signature = M.horizontal_signature(context)
    local table_alignment = TABLE_ALIGNMENTS[operation.table_alignment or "L"]
    if not table_alignment then
        return fail(context, "FORMAT_TABLE_ALIGNMENT",
            "@table alignment must be L or R", operation.span)
    end
    local columns, group_cells, group_counts = resolve_columns(
        context, operation, table_alignment, signature.capacity)
    if not columns then return nil end

    local reserved = group_cells.left + group_cells.right
    local flexible = signature.capacity - reserved
    local minimum = group_counts.left > 0 and group_counts.right > 0 and 1 or 0
    if flexible < minimum then
        local separator = minimum == 1 and
            "; left and right groups also require a one-cell gap" or ""
        return fail(context, "FORMAT_TABLE_TOO_WIDE", string.format(
            "@table columns reserve %d cells at the current %d-cell capacity%s",
            reserved, signature.capacity, separator), operation.span)
    end

    return {
        columns = columns,
        field_count = #columns,
        table_alignment = table_alignment,
        group_counts = group_counts,
        flexible_cells = flexible,
        gap_cells = 1,
        capacity = signature.capacity,
        signature = signature,
        span = operation.span,
    }
end

return M
