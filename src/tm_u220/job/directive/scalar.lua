-- Parses no-argument and scalar directives into normalized job operations.
-- Character-page values are admitted only when the canonical glyph catalog can encode them.
local Pages = require("tm_u220.charset.pages")
local Syntax = require("tm_u220.job.directive.syntax")

local M = {}

local no_argument = {
    init = "init",
    line = "line",
    tab = "tab",
}

local enums = {
    align = { left = true, center = true, right = true },
    font = { a = true, b = true },
    underline = { off = true, single = true, double = true },
    color = { black = true, red = true },
}

local toggles = {
    emphasis = "emphasis",
    ["double-strike"] = "double_strike",
    ["double-width"] = "double_width",
    ["double-height"] = "double_height",
    ["upside-down"] = "upside_down",
}

local integers = {
    spacing = "spacing",
    feed = "feed",
    ["feed-units"] = "feed_units",
    ["reverse-lines"] = "reverse_lines",
    ["reverse-units"] = "reverse_units",
}

local names = { ["code-page"] = true, ["line-spacing"] = true }
for name in pairs(no_argument) do names[name] = true end
for name in pairs(enums) do names[name] = true end
for name in pairs(toggles) do names[name] = true end
for name in pairs(integers) do names[name] = true end

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
    if number < 0 or number > 255 then
        return nil
    end

    return number
end

function M.parse(name, arguments, span)
    local value = Syntax.trim(arguments)
    local kind = no_argument[name]
    if kind then
        if value ~= nil and value ~= "" then
            return nil, issue(name, "no arguments"), true
        end

        return { kind = kind, span = span }, nil, true
    end

    local allowed = enums[name]
    if allowed then
        if not allowed[value] then
            local expected = name == "align" and "left, center, or right"
                or name == "font" and "a or b"
                or name == "underline" and "off, single, or double"
                or "black or red"
            return nil, issue(name, expected), true
        end

        return {
            kind = name,
            value = value,
            span = span,
        }, nil, true
    end

    kind = toggles[name]
    if kind then
        if value ~= "on" and value ~= "off" then
            return nil, issue(name, "on or off"), true
        end

        return {
            kind = kind,
            enabled = value == "on",
            span = span,
        }, nil, true
    end

    kind = integers[name]
    if kind then
        local number = byte_value(value)
        if number == nil then
            return nil, issue(name, "an integer from 0 through 255"), true
        end

        return { kind = kind, value = number, span = span }, nil, true
    end

    if name == "code-page" then
        local number = byte_value(value)
        if number == nil or not Pages.has_page(number) then
            return nil,
                issue(name, "an integer present in the public standard-page catalog"),
                true
        end

        return { kind = "code_page", value = number, span = span }, nil, true
    end

    if name == "line-spacing" then
        local spacing = value == "default" and "default"
            or byte_value(value)
        if spacing == nil then
            return nil,
                issue(name, "default or an integer from 0 through 255"),
                true
        end

        return {
            kind = "line_spacing",
            value = spacing,
            span = span,
        }, nil, true
    end

    return nil, nil, false
end

return M
