-- Parses authored directives after resolving concise spellings to canonical input.
-- Downstream job operations therefore remain independent of authoring aliases.
local Aliases = require("tm_u220.job.directive.aliases")
local Chain = require("tm_u220.job.directive.chain")
local Image = require("tm_u220.job.directive.image")
local Scalar = require("tm_u220.job.directive.scalar")
local Finish = require("tm_u220.job.directive.finish")
local Structured = require("tm_u220.job.directive.structured")
local Tabular = require("tm_u220.job.directive.tabular")
local Syntax = require("tm_u220.job.directive.syntax")

local M = {}
local PARSERS = { Scalar, Image, Finish, Tabular, Structured }

function M.is_canonical(name)
    for _, parser in ipairs(PARSERS) do
        if parser.recognizes(name) then return true end
    end
    return false
end

function M.canonical_names()
    local seen, result = {}, {}
    for _, parser in ipairs(PARSERS) do
        for name in pairs(parser.names) do
            if not seen[name] then
                seen[name] = true
                result[#result + 1] = name
            end
        end
    end
    table.sort(result)
    return result
end

local function syntax_issue(message)
    return {
        code = "job.directive.invalid_syntax",
        message = message,
    }
end

local function parse_canonical(name, arguments, span)
    local operation, failure, handled = Scalar.parse(name, arguments, span)
    if handled then return operation, failure end

    operation, failure, handled = Image.parse(name, arguments, span)
    if handled then return operation, failure end

    operation, failure, handled = Finish.parse(name, arguments, span)
    if handled then return operation, failure end

    operation, failure, handled = Tabular.parse(name, arguments, span)
    if handled then return operation, failure end

    operation, failure, handled = Structured.parse(name, arguments, span)
    if handled then return operation, failure end

    return nil, {
        code = "job.directive.unknown",
        message = "unknown directive @" .. name,
    }
end

local function authored_parts(line, aliases)
    local name, arguments, syntax_failure = Syntax.parse(line)
    if not name then
        return nil, syntax_issue(syntax_failure)
    end
    return Aliases.expand(name, arguments, aliases)
end

function M.parse(line, span, aliases)
    local targets, failure = authored_parts(line, aliases)
    if not targets then return nil, failure end
    if #targets ~= 1 then
        local name = Syntax.directive_name(line)
        local _, _, alias_failure = Aliases.resolve(name, nil, aliases)
        return nil, alias_failure
    end
    return parse_canonical(targets[1][1], targets[1][2], span)
end

local function parse_authored(line, span, aliases)
    local targets, failure = authored_parts(line, aliases)
    if not targets then return nil, failure end

    local operations = {}
    for _, target in ipairs(targets) do
        local operation
        operation, failure = parse_canonical(target[1], target[2], span)
        if failure then return nil, failure end
        operations[#operations + 1] = operation
    end
    return operations
end

function M.parse_many(line, span, aliases)
    local whole = parse_authored(line, span, aliases)
    if whole and Chain.operation_owner(whole) then
        return whole
    end
    return Chain.parse(line, span, function(member, member_span)
        return parse_authored(member, member_span, aliases)
    end)
end

return M
