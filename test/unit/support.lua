local M = {}

local function describe(value)
    if type(value) == "string" then return string.format("%q", value) end
    return tostring(value)
end

function M.equal(actual, expected, message)
    if actual ~= expected then
        error((message or "values differ") .. ": expected " .. describe(expected)
            .. ", got " .. describe(actual), 2)
    end
end

function M.truthy(value, message)
    if not value then error(message or "expected a truthy value", 2) end
end

function M.falsy(value, message)
    if value then error(message or "expected a falsy value", 2) end
end

function M.contains(value, fragment, message)
    if type(value) ~= "string" or not value:find(fragment, 1, true) then
        error(message or ("expected string containing " .. describe(fragment)), 2)
    end
end

function M.bytes(hex)
    local out = {}
    for pair in hex:gmatch("%x%x") do
        out[#out + 1] = string.char(tonumber(pair, 16))
    end
    return table.concat(out)
end

return M
