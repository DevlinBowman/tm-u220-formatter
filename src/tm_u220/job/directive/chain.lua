-- Splits authored directive chains while preserving text-bearing pipe semantics.
-- Members may expand into canonical operation sequences, which are flattened in order.
local M = {}
local Syntax = require("tm_u220.job.directive.syntax")
local SEPARATOR = " | @"
local line_owners = {
    ["end-table"] = true,
    head = true,
    image = true,
    kv = true,
    row = true,
    table = true,
}
local operation_owners = {
    image = "@image",
    kv = "@kv",
    table_start = "@table",
    table_head = "@head",
    table_row = "@row",
    table_end = "@end-table",
}

local function directive_name(value)
    return Syntax.directive_name(value)
end

local function next_pipe(line, cursor, include_escaped)
    while true do
        local pipe = line:find("|", cursor, true)
        if not pipe then return nil end
        local escaped = line:sub(pipe - 1, pipe - 1) == "\\"
        if include_escaped or not escaped then return pipe end
        cursor = pipe + 1
    end
end

local function next_candidate(line, cursor, include_escaped)
    while true do
        local pipe = next_pipe(line, cursor, include_escaped)
        if not pipe then return nil end
        local at = pipe + 1
        while line:sub(at, at):match("[ \t]") do at = at + 1 end
        local name = line:sub(at):match("^@([a-z][a-z%-]*)")
        if name then return pipe, at, name end
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
        local owner_failure = M.owner_failure(expanded)
        if owner_failure then return nil, owner_failure end
        for _, operation in ipairs(expanded) do
            operations[#operations + 1] = operation
        end
    end
    return operations
end

M.SEPARATOR = SEPARATOR
M.find_candidate = next_candidate
M.find_pipe = next_pipe

function M.operation_owner(operations)
    for _, operation in ipairs(operations or {}) do
        local owner = operation_owners[operation.kind]
        if owner then return owner end
    end
end

function M.owner_failure(operations)
    local owner = M.operation_owner(operations)
    if not owner then return nil end
    return {
        code = "job.directive.invalid_syntax",
        message = owner .. " cannot be used in a source-line directive sequence",
    }
end

function M.find_separator(line, cursor)
    return next_candidate(line, cursor or 1, false)
end

return M
