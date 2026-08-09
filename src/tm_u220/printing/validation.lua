-- Provides canonical scalar validation shared by installed printing-policy readers.
-- It rejects textual aliases and impossible dates before they can select privileged routes.
local M = {}

function M.integer(value, label, minimum, maximum)
    if type(value) ~= "string" or not value:match("^%d+$")
        or (#value > 1 and value:sub(1, 1) == "0") then
        return nil, label .. " must be a canonical integer"
    end
    local number = tonumber(value)
    if not number or number < minimum or number > maximum then
        return nil, string.format("%s must be from %d through %d", label, minimum, maximum)
    end
    return number
end

function M.ipv4(value)
    if type(value) ~= "string" or not value:match("^%d+%.%d+%.%d+%.%d+$") then
        return nil, "printer_ipv4 must be a canonical numeric IPv4 address"
    end
    local parts = {}
    for part in value:gmatch("%d+") do
        if #part > 1 and part:sub(1, 1) == "0" then
            return nil, "printer_ipv4 octets must not contain leading zeroes"
        end
        local number = tonumber(part)
        if number > 255 then return nil, "printer_ipv4 contains an invalid octet" end
        parts[#parts + 1] = number
    end
    local private = parts[1] == 10
        or (parts[1] == 172 and parts[2] >= 16 and parts[2] <= 31)
        or (parts[1] == 192 and parts[2] == 168)
        or (parts[1] == 169 and parts[2] == 254)
    if not private then return nil, "printer_ipv4 must be private or link-local" end
    return value
end

local function leap_year(year)
    return year % 4 == 0 and (year % 100 ~= 0 or year % 400 == 0)
end

function M.timestamp(value)
    if type(value) ~= "string" then return false end
    local year, month, day, hour, minute, second = value:match(
        "^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)%.%d%d%dZ$"
    )
    year, month, day = tonumber(year), tonumber(month), tonumber(day)
    hour, minute, second = tonumber(hour), tonumber(minute), tonumber(second)
    if not year or month < 1 or month > 12 or hour > 23 or minute > 59 or second > 59 then
        return false
    end
    local days = { 31, leap_year(year) and 29 or 28, 31, 30, 31, 30,
        31, 31, 30, 31, 30, 31 }
    return day >= 1 and day <= days[month]
end

return M
