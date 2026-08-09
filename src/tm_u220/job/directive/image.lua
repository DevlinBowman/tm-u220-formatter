-- Parses the line-owning @image directive into a path and optional character-cell box.
-- Filesystem policy and image decoding deliberately remain outside the job grammar.
local Syntax = require("tm_u220.job.directive.syntax")

local M = {}
M.names = { image = true }

local function issue(message)
    return {
        code = "job.directive.invalid_arguments",
        message = "@image expects " .. message,
    }
end

local function quoted_path(value)
    local out, cursor = {}, 2
    while cursor <= #value do
        local character = value:sub(cursor, cursor)
        if character == '"' then
            return table.concat(out), value:sub(cursor + 1)
        end
        if character == "\\" then
            local escaped = value:sub(cursor + 1, cursor + 1)
            if escaped ~= "\\" and escaped ~= '"' then return nil end
            out[#out + 1] = escaped
            cursor = cursor + 2
        else
            out[#out + 1] = character
            cursor = cursor + 1
        end
    end
end

local function path_and_tail(arguments)
    local value = Syntax.trim(arguments)
    if not value or value == "" then return nil end
    if value:sub(1, 1) == '"' then return quoted_path(value) end
    local path, tail = value:match("^([^ \t]+)(.*)$")
    return path, tail
end

local function box_value(value, symbolic)
    if value == symbolic then return value end
    if not value or not value:match("^%d+$") then return nil end
    local number = tonumber(value)
    if number < 1 or number > 255 then return nil end
    return number
end

function M.recognizes(name)
    return name == "image"
end

function M.parse(name, arguments, span)
    if name ~= "image" then return nil, nil, false end
    local path, tail = path_and_tail(arguments)
    if not path or path == "" or path:find("[%z\1-\31\127]") then
        return nil, issue('a relative path, optionally followed by WIDTH HEIGHT'), true
    end

    local tokens = {}
    for token in Syntax.trim(tail or ""):gmatch("[^ \t]+") do
        tokens[#tokens + 1] = token
    end
    if #tokens ~= 0 and #tokens ~= 2 then
        return nil, issue('PATH or PATH WIDTH HEIGHT'), true
    end

    local width, height
    if #tokens == 2 then
        width = box_value(tokens[1], "page")
        height = box_value(tokens[2], "auto")
        if not width or not height then
            return nil, issue('PATH then WIDTH (1..255 or page) and HEIGHT (1..255 or auto)'),
                true
        end
    end
    return {
        kind = "image",
        path = path,
        width_cells = width,
        height_cells = height,
        span = span,
    }, nil, true
end

return M
