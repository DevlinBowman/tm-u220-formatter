-- Parses the versioned, declarative directive-alias configuration format.
-- It produces data-only mappings; canonical directive parsers validate all targets later.
local Chain = require("tm_u220.job.directive.chain")
local Syntax = require("tm_u220.job.directive.syntax")

local M = {}
local HEADER = "!tm-u220 aliases 1"

local function split_lines(source)
    local lines = {}
    source = source or ""
    for line in (source .. "\n"):gmatch("(.-)\n") do
        lines[#lines + 1] = line:gsub("\r$", "")
    end
    return lines
end

local function issue(document, code, message, line)
    document.diagnostics[#document.diagnostics + 1] = {
        code = code, message = message, line = line,
    }
end

local function parse_targets(source)
    return Chain.parse(source, nil, function(member)
        local name, arguments, failure = Syntax.parse(member)
        if not name then
            return nil, { message = failure }
        end
        arguments = Syntax.trim(arguments)
        if arguments == "" then arguments = nil end
        return { { name, arguments } }
    end)
end

local function placeholder_failure(forwarding, targets)
    local count = 0
    for _, target in ipairs(targets) do
        local arguments = target[2]
        if arguments == "*" then
            count = count + 1
        elseif arguments and arguments:find("*", 1, true) then
            return "* must be the complete argument of a target directive"
        end
    end
    if forwarding and count == 0 then
        return "an argument-forwarding alias must use * in a target directive"
    end
    if not forwarding and count > 0 then
        return "a zero-argument alias cannot use * in its targets"
    end
end

local function add_mapping(document, line, line_number)
    local left, right = line:match("^(.-)[ \t]*==[ \t]*(.-)$")
    if not left or right == "" then
        issue(document, "alias.mapping.invalid",
            "expected @alias [*] == @canonical [argument]", line_number)
        return
    end

    local name, arguments, syntax_failure = Syntax.parse(left)
    arguments = Syntax.trim(arguments)
    if not name or (arguments ~= nil and arguments ~= "" and arguments ~= "*") then
        issue(document, "alias.mapping.invalid_lhs",
            syntax_failure or "alias arguments must be exactly *", line_number)
        return
    end

    local targets, target_failure = parse_targets(right)
    if not targets then
        issue(document, "alias.mapping.invalid_target",
            target_failure.message, line_number)
        return
    end

    local forwarding = arguments == "*"
    local placeholder_issue = placeholder_failure(forwarding, targets)
    if placeholder_issue then
        issue(document, "alias.mapping.invalid_placeholder",
            placeholder_issue, line_number)
        return
    end

    local entry = document.entries[name] or {}
    local variant = forwarding and "arguments" or "bare"
    if entry[variant] then
        issue(document, "alias.mapping.duplicate",
            "duplicate " .. variant .. " mapping for @" .. name, line_number)
        return
    end
    entry[variant] = targets
    document.entries[name] = entry
    document.mappings[#document.mappings + 1] = {
        name = name, variant = variant, targets = targets,
    }
end

function M.parse(source)
    local document = { version = 1, entries = {}, mappings = {}, diagnostics = {} }
    if type(source) ~= "string" then
        issue(document, "alias.input.invalid_type",
            "alias configuration must be a string", 1)
        return document
    end

    local header_seen = false
    for line_number, line in ipairs(split_lines(source)) do
        local trimmed = Syntax.trim(line)
        if trimmed ~= "" and trimmed:sub(1, 1) ~= "#" then
            if not header_seen then
                header_seen = true
                if trimmed ~= HEADER then
                    issue(document, "alias.header.invalid",
                        "first content line must be exactly " .. HEADER, line_number)
                end
            elseif trimmed == HEADER then
                issue(document, "alias.header.duplicate",
                    "alias header may appear only once", line_number)
            else
                add_mapping(document, trimmed, line_number)
            end
        end
    end

    if not header_seen then
        issue(document, "alias.header.missing",
            "alias header is missing; expected " .. HEADER, 1)
    end
    return document
end

M.HEADER = HEADER

return M
