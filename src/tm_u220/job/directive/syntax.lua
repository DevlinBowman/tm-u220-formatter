local M = {}

local HORIZONTAL_EDGE = "^[ \t]*(.-)[ \t]*$"

function M.trim(value)
    if value == nil then return nil end
    return value:match(HORIZONTAL_EDGE)
end

function M.parse(line)
    if type(line) ~= "string" then return nil, nil, "invalid directive name" end
    local name, tail = line:match("^[ \t]*@([a-z][a-z%-]*)(.*)$")
    if not name then return nil, nil, "invalid directive name" end
    if tail == "" then return name end
    if not tail:match("^[ \t]") then
        return nil, nil, "@" .. name .. " requires whitespace before arguments"
    end
    return name, tail:sub(2)
end

function M.directive_name(line)
    return type(line) == "string"
        and line:match("^[ \t]*@([a-z][a-z%-]*)") or nil
end

function M.unescape_line(line)
    if type(line) ~= "string" then return nil end
    local indentation, value = line:match("^([ \t]*)@@(.*)$")
    if indentation then return indentation .. "@" .. value end
end

function M.starts_line(line)
    return type(line) == "string"
        and line:match("^[ \t]*@") ~= nil
end

return M
