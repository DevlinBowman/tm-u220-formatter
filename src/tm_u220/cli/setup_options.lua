-- Validates explicit printing-setup selections before crossing into the Node helper.
-- A bare setup remains guided; supplied hosts must match the helper's canonical IPv4 policy.
local M = {}

local function canonical_octets(value)
    if type(value) ~= "string" then
        return nil, "printer IPv4 address must be text"
    end
    local fields = {}
    for field in (value .. "."):gmatch("(.-)%.") do fields[#fields + 1] = field end
    if #fields ~= 4 then
        return nil, "printer IPv4 address must contain four canonical decimal octets"
    end
    local octets = {}
    for index, field in ipairs(fields) do
        if field ~= "0" and not field:match("^[1-9]%d?%d?$") then
            return nil, "printer IPv4 address must contain four canonical decimal octets"
        end
        octets[index] = tonumber(field)
        if octets[index] > 255 then
            return nil, "printer IPv4 address contains an octet above 255"
        end
    end
    return octets
end

function M.validate(result)
    local value = result.options.host
    if value == nil then return result end
    local octets, err = canonical_octets(value)
    if not octets then return nil, err end
    local a, b = octets[1], octets[2]
    local private = a == 10 or (a == 172 and b >= 16 and b <= 31)
        or (a == 192 and b == 168)
    local link_local = a == 169 and b == 254
    if not private and not link_local then
        return nil, "printer IPv4 address must be private or IPv4 link-local"
    end
    if octets[1] == 255 and octets[2] == 255
        and octets[3] == 255 and octets[4] == 255 then
        return nil, "printer IPv4 address cannot be a broadcast address"
    end
    return result
end

return M
