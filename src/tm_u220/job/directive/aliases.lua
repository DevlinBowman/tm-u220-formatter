-- Expands data-driven convenience mappings into canonical directive inputs.
-- It never interprets target behavior, keeping canonical parsers authoritative.
local Catalog = require("tm_u220.job.directive.alias_catalog")
local Syntax = require("tm_u220.job.directive.syntax")

local M = {}

local function canonical_text(targets)
    local parts = {}
    for _, target in ipairs(targets) do
        parts[#parts + 1] = "@" .. target[1]
            .. (target[2] and " " .. target[2] or "")
    end
    return table.concat(parts, " | ")
end

local function wrong_arguments(alias, entry, has_arguments)
    local targets = has_arguments and entry.bare or nil
    if not has_arguments then targets = entry.arguments end
    local expectation = has_arguments and "expects no arguments"
        or "requires arguments"
    return {
        code = "job.directive.invalid_arguments",
        message = targets and string.format(
            "@%s is an alias for %s and %s",
            alias, canonical_text(targets), expectation)
            or "@" .. alias .. " " .. expectation,
    }
end

local function entries(value)
    if value then return value.entries or value end
    local catalog, failure = Catalog.load()
    return catalog and catalog.entries or nil, failure
end

function M.expand(name, arguments, configured)
    local aliases, load_failure = entries(configured)
    if not aliases then return nil, load_failure end
    local entry = aliases[name]
    if not entry then return { { name, arguments } } end

    local value = Syntax.trim(arguments)
    local has_arguments = value ~= nil and value ~= ""
    local targets = has_arguments and entry.arguments or nil
    if not has_arguments then targets = entry.bare end
    if not targets then
        return nil, wrong_arguments(name, entry, has_arguments)
    end

    local expanded = {}
    for _, target in ipairs(targets) do
        expanded[#expanded + 1] = {
            target[1], target[2] == "*" and value or target[2],
        }
    end
    return expanded
end

function M.resolve(name, arguments, configured)
    local targets, failure = M.expand(name, arguments, configured)
    if not targets then return nil, nil, failure end
    if #targets ~= 1 then
        return nil, nil, {
            code = "job.directive.alias_expands_many",
            message = "@" .. name .. " expands to " .. canonical_text(targets),
        }
    end
    return targets[1][1], targets[1][2]
end

return M
