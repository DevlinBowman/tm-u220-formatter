-- Splits authored directive chains while preserving text-bearing pipe semantics.
-- Each member may expand into several canonical operations, which are flattened in order.
local M = {}
local Syntax = require("tm_u220.job.directive.syntax")
local SEPARATOR = " | @"
local line_owners = {
    ["end-table"] = true,
    head = true,
    kv = true,
    row = true,
    table = true,
}
local operation_owners = {
    kv = "@kv",
    table_start = "@table",
    table_head = "@head",
    table_row = "@row",
    table_end = "@end-table",
}

local function directive_name(value)
    return Syntax.directive_name(value)
end

local function next_candidate(line, cursor, include_escaped)
    while true do
        local pipe = line:find("|", cursor, true)
        if not pipe then return nil end
        local at = pipe + 1
        while line:sub(at, at):match("[ \t]") do at = at + 1 end
        local name = line:sub(at):match("^@([a-z][a-z%-]*)")
        local escaped = line:sub(pipe - 1, pipe - 1) == "\\"
        if name and (include_escaped or not escaped) then
            return pipe, at, name
        end
        cursor = pipe + 1
    end
end

local function split(line)
    local parts = {}
    local cursor = 1
    while true do
        local pipe, at = next_candidate(line, cursor, false)
        if not pipe then
            parts[#parts + 1] = line:sub(cursor)
            return parts
        end
        local member_end = pipe - 1
        if line:sub(member_end, member_end):match("[ \t]") then
            member_end = member_end - 1
        end
        parts[#parts + 1] = line:sub(cursor, member_end)
        cursor = at
    end
end

function M.is_chain(line)
    local name = type(line) == "string" and directive_name(line)
    return name ~= nil and not line_owners[name]
        and next_candidate(line, 1, false) ~= nil
end

function M.parse(line, span, parse_member)
    if not M.is_chain(line) then
        return parse_member(line, span)
    end

    local sources = split(line)
    for _, source in ipairs(sources) do
        local name = directive_name(source)
        if line_owners[name] then
            return nil, {
                code = "job.directive.invalid_syntax",
                message = "@" .. name
                    .. " cannot be used in a source-line directive sequence",
            }
        end
    end

    local operations = {}
    for _, source in ipairs(sources) do
        local expanded, failure = parse_member(source, span)
        if failure then return nil, failure end
        local owner = M.operation_owner(expanded)
        if owner then
            return nil, {
                code = "job.directive.invalid_syntax",
                message = owner
                    .. " cannot be used in a source-line directive sequence",
            }
        end
        for _, operation in ipairs(expanded) do
            operations[#operations + 1] = operation
        end
    end
    return operations
end

M.SEPARATOR = SEPARATOR
M.find_candidate = next_candidate

function M.operation_owner(operations)
    for _, operation in ipairs(operations or {}) do
        local owner = operation_owners[operation.kind]
        if owner then return owner end
    end
end

function M.find_separator(line, cursor)
    return next_candidate(line, cursor or 1, false)
end

return M
