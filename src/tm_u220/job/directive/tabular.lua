-- Parses table schemas and their pipe-delimited authored fields into normalized operations.
-- Physical width allocation remains the formatter's responsibility rather than authoring syntax.
local Syntax = require("tm_u220.job.directive.syntax")

local M = {}

local MAX_SAFE_INTEGER = 9007199254740991
local names = { table = true, head = true, row = true, ["end-table"] = true }

function M.recognizes(name)
    return names[name] == true
end

M.names = names

local function issue(name, expected)
    return {
        code = "job.directive.invalid_arguments",
        message = "@" .. name .. " expects " .. expected,
    }
end

local function positive_width(digits)
    local width = digits and tonumber(digits)
    if not width or width <= 0 or math.type(width) ~= "integer"
        or width > MAX_SAFE_INTEGER then
        return nil
    end
    return width
end

local function tokens_from(arguments)
    if type(arguments) ~= "string" or Syntax.trim(arguments) == "" then
        return nil
    end

    local tokens = {}
    local cursor = 1
    while true do
        local comma = arguments:find(",", cursor, true)
        local token = Syntax.trim(arguments:sub(cursor, comma and comma - 1))
        if token == "" then return nil end
        tokens[#tokens + 1] = token

        if not comma then break end
        cursor = comma + 1
    end
    return tokens
end

local function parse_schema(arguments)
    local tokens = tokens_from(arguments)
    if not tokens then return nil end

    local table_alignment = "L"
    local first_column = 1
    if tokens[1]:match("^[LlRr]$") then
        table_alignment = tokens[1]:upper()
        first_column = 2
    end

    if first_column > #tokens then return nil end

    local columns = {}
    for index = first_column, #tokens do
        local digits, suffix = tokens[index]:match("^(%d+)([LlCcRr]*)$")
        local width = positive_width(digits)
        if not width or #suffix > 2 then return nil end

        local content_alignment = suffix:sub(1, 1)
        local group_alignment = suffix:sub(2, 2)
        content_alignment = content_alignment ~= ""
            and content_alignment:upper() or "L"
        group_alignment = group_alignment ~= ""
            and group_alignment:upper() or table_alignment
        if group_alignment ~= "L" and group_alignment ~= "R" then return nil end

        columns[#columns + 1] = {
            width = width,
            content_alignment = content_alignment,
            group_alignment = group_alignment,
        }
    end

    return table_alignment, columns
end

local function parse_fields(arguments)
    if type(arguments) ~= "string" then return nil end

    local fields = {}
    local characters = {}
    local cursor = 1
    while cursor <= #arguments do
        local character = arguments:sub(cursor, cursor)
        if character == "\\" and arguments:sub(cursor + 1, cursor + 1) == "|" then
            characters[#characters + 1] = "|"
            cursor = cursor + 2
        elseif character == "|" then
            fields[#fields + 1] = Syntax.trim(table.concat(characters))
            characters = {}
            cursor = cursor + 1
        else
            characters[#characters + 1] = character
            cursor = cursor + 1
        end
    end
    fields[#fields + 1] = Syntax.trim(table.concat(characters))
    return fields
end

function M.parse(name, arguments, span)
    if not M.recognizes(name) then return nil, nil, false end
    if name == "table" then
        local table_alignment, columns = parse_schema(arguments)
        if not table_alignment then
            return nil,
                issue(name, "an optional L/R table alignment followed by "
                    .. "WIDTH[CONTENT[GROUP]] columns, such as R,9,4LR"),
                true
        end
        return {
            kind = "table_start",
            table_alignment = table_alignment,
            columns = columns,
            span = span,
        }, nil, true
    end

    if name == "head" or name == "row" then
        local fields = parse_fields(arguments)
        if not fields then
            return nil, issue(name, "pipe-separated fields"), true
        end
        return {
            kind = name == "head" and "table_head" or "table_row",
            fields = fields,
            span = span,
        }, nil, true
    end

    if name == "end-table" then
        local value = Syntax.trim(arguments)
        if value ~= nil and value ~= "" then
            return nil, issue(name, "no arguments"), true
        end
        return { kind = "table_end", span = span }, nil, true
    end

    error("unimplemented tabular directive @" .. tostring(name), 0)
end

return M
