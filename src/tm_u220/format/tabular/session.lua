-- Owns one active table declaration and renders validated header/row fields atomically.
-- Printer output remains a full-capacity padded text line followed by a normal line feed.
local schema_api = require("tm_u220.format.tabular.schema")

local Session = {}
Session.__index = Session

local HORIZONTAL_OPERATIONS = {
    init = true,
    align = true,
    font = true,
    double_width = true,
    spacing = true,
    upside_down = true,
}

local function operation_label(operation)
    return "@" .. operation.kind:gsub("_", "-")
end

local function padded(value, cells, column)
    local fill = column.cells - cells
    if column.content_alignment == "right" then
        return (" "):rep(fill) .. value
    elseif column.content_alignment == "center" then
        local left = math.floor(fill / 2)
        return (" "):rep(left) .. value .. (" "):rep(fill - left)
    end
    return value .. (" "):rep(fill)
end

local function render_line(active, fields, measured)
    local groups = { left = {}, right = {} }
    for index, value in ipairs(fields) do
        local column = active.columns[index]
        local group = groups[column.group_alignment]
        group[#group + 1] = padded(value, measured[index], column)
    end

    local gap = (" "):rep(active.gap_cells)
    local left = table.concat(groups.left, gap)
    local right = table.concat(groups.right, gap)
    local flexible = (" "):rep(active.flexible_cells)
    local frame
    if active.group_counts.left == 0 then
        frame = flexible .. right
    elseif active.group_counts.right == 0 then
        frame = left .. flexible
    else
        frame = left .. flexible .. right
    end
    return frame
end

function Session.new()
    return setmetatable({ active = nil }, Session)
end

function Session:is_active()
    return self.active ~= nil
end

function Session:_horizontal_error(context, operation, detail)
    if not self.active.horizontal_error then
        context:add_diagnostic(
            "FORMAT_TABLE_LAYOUT_CHANGED",
            "table layout is frozen at @table; " .. detail,
            operation and operation.span or self.active.span
        )
        self.active.horizontal_error = true
    end
    return false
end

function Session:validate_horizontal_state(context, operation)
    if not self.active then return true end
    if self.active.horizontal_error then return false end
    local label, expected, actual = schema_api.horizontal_change(
        self.active, context)
    if not label then return true end
    return self:_horizontal_error(context, operation, string.format(
        "%s changed from %s to %s", label, tostring(expected), tostring(actual)))
end

function Session:allows_operation(context, operation)
    if not self.active or not HORIZONTAL_OPERATIONS[operation.kind] then
        return true
    end
    return self:_horizontal_error(context, operation,
        operation_label(operation) .. " cannot be changed inside a table")
end

function Session:start(context, operation)
    if self.active then
        context:add_diagnostic("FORMAT_TABLE_NESTED",
            "@table cannot begin while another table is active", operation.span)
        return false
    end
    if not context:require_beginning("@table", operation.span) then return false end
    local resolved = schema_api.resolve(context, operation)
    if not resolved then return false end
    self.active = resolved
    return true
end

function Session:_write(context, operation, header)
    local label = header and "@head" or "@row"
    if not self.active then
        context:add_diagnostic("FORMAT_TABLE_NOT_ACTIVE",
            label .. " requires an active @table", operation.span)
        return false
    end
    if not context:require_beginning(label, operation.span) then return false end
    if not self:validate_horizontal_state(context, operation) then return false end

    local fields = operation.fields
    local count = type(fields) == "table" and #fields or 0
    if count ~= self.active.field_count then
        context:add_diagnostic("FORMAT_TABLE_FIELD_COUNT", string.format(
            "%s requires %d fields but received %d", label,
            self.active.field_count, count), operation.span)
        return false
    end

    local measured = {}
    local valid = true
    for index, value in ipairs(fields) do
        local span = operation.field_spans and operation.field_spans[index]
            or operation.span
        local cells = context:text_cells(value, span)
        measured[index] = cells
        if not cells then
            valid = false
        elseif cells > self.active.columns[index].cells then
            local heading = self.active.headings and self.active.headings[index]
            local name = heading and heading ~= "" and " (" .. heading .. ")" or ""
            context:add_diagnostic("FORMAT_TABLE_FIELD_TOO_WIDE", string.format(
                "%s column %d%s uses %d cells; its width is %d", label, index,
                name, cells, self.active.columns[index].cells), span)
            valid = false
        end
    end
    if not valid then return false end

    local line = render_line(self.active, fields, measured)
    if not context:text(line, operation.span) then return false end
    context:line_feed(header and "table_header" or "table_row", operation.span)

    if header then
        self.active.headings = {}
        for index, value in ipairs(fields) do self.active.headings[index] = value end
    end
    return true
end

function Session:finish_table(context, operation)
    if not self.active then
        context:add_diagnostic("FORMAT_TABLE_NOT_ACTIVE",
            "@end-table requires an active @table", operation.span)
        return false
    end
    local valid = context:require_beginning("@end-table", operation.span)
        and self:validate_horizontal_state(context, operation)
    self.active = nil
    return valid
end

function Session:handle(context, operation)
    if operation.kind == "table_start" then
        self:start(context, operation)
        return true
    end
    if operation.kind == "table_head" then
        self:_write(context, operation, true)
        return true
    end
    if operation.kind == "table_row" then
        self:_write(context, operation, false)
        return true
    end
    if operation.kind == "table_end" then
        self:finish_table(context, operation)
        return true
    end
    return false
end

function Session:finish(context)
    if not self.active then return true end
    context:add_diagnostic("FORMAT_TABLE_UNCLOSED",
        "@table must be closed with @end-table", self.active.span)
    self.active = nil
    return false
end

return Session
