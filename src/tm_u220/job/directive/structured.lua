-- Parses canonical directives whose arguments carry structured authoring data.
-- Recognition metadata keeps alias validation tied to these authoritative parsers.
local Syntax = require("tm_u220.job.directive.syntax")

local M = {}
local names = { profile = true, text = true, rule = true, kv = true, cut = true }

local profile_keys = {
    variant = true,
    paper = true,
    dip2_1 = true,
    cutter = true,
}

local paper_values = {
    ["76"] = 76,
    ["69.5"] = 69.5,
    ["57.5"] = 57.5,
}

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

local function byte_value(value)
    if type(value) ~= "string" or not value:match("^%d+$") then
        return nil
    end

    local number = tonumber(value)
    return number <= 255 and number or nil
end

local function normalized_assignments(value)
    value = Syntax.trim(value)
    if value == nil then return nil end
    return value:gsub("[ \t]*=[ \t]*", "=")
end

local function kv_separator(arguments)
    if arguments == nil then return nil end
    local pipe = arguments:find("|", 1, true)
    if pipe then return pipe end
    return arguments:match("^.*()[=;:]")
end

local function parse_profile(arguments, span)
    arguments = normalized_assignments(arguments)
    if not arguments or arguments == "" then
        return nil, issue("profile", "variant, paper, dip2_1, and cutter fields")
    end

    local fields = {}
    for token in arguments:gmatch("%S+") do
        local key, value = token:match("^([%w_]+)=([^=]+)$")
        if not key or not profile_keys[key] or fields[key] ~= nil then
            return nil, issue("profile", "four unique supported key=value fields")
        end
        fields[key] = value
    end

    for key in pairs(profile_keys) do
        if fields[key] == nil then
            return nil, issue("profile", "variant, paper, dip2_1, and cutter fields")
        end
    end

    fields.variant = fields.variant:upper()
    if fields.variant ~= "A" and fields.variant ~= "B"
        and fields.variant ~= "D" then
        return nil, issue("profile", "variant=A, variant=B, or variant=D")
    end
    if not paper_values[fields.paper] then
        return nil, issue("profile", "paper=76, paper=69.5, or paper=57.5")
    end
    if fields.dip2_1 ~= "on" and fields.dip2_1 ~= "off" then
        return nil, issue("profile", "dip2_1=on or dip2_1=off")
    end
    if fields.cutter ~= "partial" and fields.cutter ~= "full"
        and fields.cutter ~= "none" then
        return nil, issue("profile", "cutter=partial, cutter=full, or cutter=none")
    end

    return {
        kind = "profile",
        value = {
            variant = fields.variant,
            paper = paper_values[fields.paper],
            dip2_1 = fields.dip2_1 == "on",
            cutter = fields.cutter,
            span = span,
        },
    }
end

local function parse_cut(arguments, span)
    arguments = normalized_assignments(arguments)
    if not arguments or arguments == "" then
        return nil, issue("cut", "installed, full, or partial; optionally feed=N")
    end

    local mode, feed_token, extra = arguments:match("^(%S+)%s*(%S*)%s*(.*)$")
    mode = mode and mode:lower()
    if extra ~= "" or (mode ~= "installed" and mode ~= "full"
        and mode ~= "partial") then
        return nil, issue("cut", "installed, full, or partial; optionally feed=N")
    end

    local operation = { kind = "cut", mode = mode, span = span }
    if feed_token ~= "" then
        local feed = feed_token:match("^feed=(%d+)$")
        feed = byte_value(feed)
        if feed == nil then
            return nil, issue("cut", "an optional feed from 0 through 255")
        end
        operation.feed = feed
    end

    return operation
end

function M.parse(name, arguments, span)
    if not M.recognizes(name) then return nil, nil, false end
    if name == "profile" then
        local value, failure = parse_profile(arguments, span)
        return value, failure, true
    end

    if name == "text" then
        if arguments == nil then
            return nil, issue(name, "a literal value"), true
        end
        local text = arguments:gsub("\\|", "|")
        return { kind = "text", text = text, span = span }, nil, true
    end

    if name == "rule" then
        local pattern = Syntax.trim(arguments)
        if not pattern or pattern == "" then
            return nil, issue(name, "a non-blank character pattern"), true
        end
        return { kind = "rule", pattern = pattern, span = span }, nil, true
    end

    if name == "kv" then
        local separator = kv_separator(arguments)
        local left = separator and Syntax.trim(arguments:sub(1, separator - 1))
        local right = separator and Syntax.trim(arguments:sub(separator + 1))
        if not left or left == "" or right == "" then
            return nil, issue(name,
                "two non-blank values separated by |, or by a final =, ;, or :"),
                true
        end
        return { kind = "kv", left = left, right = right, span = span }, nil, true
    end

    if name == "cut" then
        local value, failure = parse_cut(arguments, span)
        return value, failure, true
    end

    error("unimplemented structured directive @" .. tostring(name), 0)
end

return M
