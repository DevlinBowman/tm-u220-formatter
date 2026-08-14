-- Resolves optional directive boundaries only after a canonical prefix is complete.
-- State modifiers may prefix ordinary line text; only a terminal reset may follow it.
local Chain = require("tm_u220.job.directive.chain")

local M = {}

local inline_kinds = {
    align = true,
    code_page = true,
    color = true,
    double_height = true,
    double_strike = true,
    double_width = true,
    emphasis = true,
    font = true,
    line_spacing = true,
    spacing = true,
    underline = true,
    upside_down = true,
}

local tail_kinds = {
    rule = true,
    text = true,
}

local function append(target, values)
    for _, value in ipairs(values or {}) do target[#target + 1] = value end
end

local function all_inline(operations)
    if not operations or #operations == 0 then return false end
    for _, operation in ipairs(operations) do
        if not inline_kinds[operation.kind] then return false end
    end
    return true
end

local function owns_tail(operations)
    for _, operation in ipairs(operations or {}) do
        if tail_kinds[operation.kind] then return true end
    end
    return false
end

local function boundaries(source)
    local found = {}
    local cursor = 1
    while true do
        local first, last = source:find("[ \t]+", cursor)
        if not first then return found end
        found[#found + 1] = { first = first, last = last }
        cursor = last + 1
    end
end

local function payload_boundaries(source)
    local found = boundaries(source)
    local cursor = 1
    while true do
        local pipe = Chain.find_pipe(source, cursor, false)
        if not pipe then break end
        found[#found + 1] = { first = pipe, last = pipe, pipe = true }
        cursor = pipe + 1
    end
    table.sort(found, function(left, right) return left.first < right.first end)
    return found
end

local function directive_boundaries(source)
    local found = {}
    for _, boundary in ipairs(boundaries(source)) do
        local suffix = source:sub(boundary.last + 1)
        if suffix:match("^@[a-z][a-z%-]*") then
            found[#found + 1] = {
                prefix_last = boundary.first - 1,
                suffix_first = boundary.last + 1,
                explicit = false,
            }
        end
    end

    local cursor = 1
    while true do
        local pipe, at = Chain.find_separator(source, cursor)
        if not pipe then break end
        local prefix_last = pipe - 1
        if source:sub(prefix_last, prefix_last):match("[ \t]") then
            prefix_last = prefix_last - 1
        end
        found[#found + 1] = {
            prefix_last = prefix_last,
            suffix_first = at,
            explicit = true,
        }
        cursor = pipe + 1
    end
    table.sort(found, function(left, right)
        return left.prefix_last < right.prefix_last
    end)
    return found
end

local function inline_text(source, boundary)
    if boundary.pipe then
        local payload = source:sub(boundary.last + 1)
        if payload:match("^[ \t]") then payload = payload:sub(2) end
        return payload
    end
    local suffix = source:sub(boundary.last + 1)
    if suffix:sub(1, 1) ~= "|" then
        return source:sub(boundary.first + 1)
    end
    local payload = suffix:sub(2)
    if payload:match("^[ \t]") then payload = payload:sub(2) end
    return payload
end

local parse_implicit

local function parse_init_postlude(source, span, parse_member)
    local candidates = directive_boundaries(source)
    for index = 1, #candidates do
        local boundary = candidates[index]
        local suffix = source:sub(boundary.suffix_first)
        local follows_pipe = not boundary.explicit
            and source:sub(boundary.prefix_last, boundary.prefix_last) == "|"
        if not follows_pipe and suffix:match("^@[a-z][a-z%-]*[ \t]*$") then
            local reset = parse_member(suffix, span)
            if reset and #reset == 1 and reset[1].kind == "init" then
                local prefix = parse_implicit(
                    source:sub(1, boundary.prefix_last), span, parse_member)
                if prefix and prefix[#prefix].kind == "text_line" then
                    append(prefix, reset)
                    return prefix
                end
            end
        end
    end
end

parse_implicit = function(source, span, parse_member)
    local postlude = parse_init_postlude(source, span, parse_member)
    if postlude then return postlude end

    local whole, whole_failure = parse_member(source, span)
    if whole and Chain.operation_owner(whole) then return whole end
    local candidates = payload_boundaries(source)
    for _, boundary in ipairs(directive_boundaries(source)) do
        local prefix = source:sub(1, boundary.prefix_last)
        local operations = parse_member(prefix, span)
        if operations then
            local owner_failure = Chain.owner_failure(operations)
            if owner_failure then return nil, whole_failure or owner_failure end
            if boundary.explicit or not owns_tail(operations) then
                local suffix = source:sub(boundary.suffix_first)
                local following, following_failure = parse_implicit(
                    suffix, span, parse_member)
                if not following then return nil, following_failure end
                owner_failure = Chain.owner_failure(following)
                if owner_failure then return nil, owner_failure end
                append(operations, following)
                return operations
            end
        end
    end

    if whole then return whole end

    for index = #candidates, 1, -1 do
        local boundary = candidates[index]
        local suffix = source:sub(boundary.last + 1)
        if not suffix:match("^@[a-z][a-z%-]*") then
            local prefix = source:sub(1, boundary.first - 1)
            local operations = parse_member(prefix, span)
            if all_inline(operations) then
                local text = inline_text(source, boundary)
                if text:sub(1, 1) ~= "@" then
                    operations[#operations + 1] = {
                        kind = "text_line",
                        text = text,
                        span = span,
                    }
                    return operations
                end
            end
        end
    end
    return nil, whole_failure
end

function M.parse(line, span, parse_member)
    return parse_implicit(line, span, parse_member)
end

return M
