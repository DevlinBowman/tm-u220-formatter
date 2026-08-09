local M = {}

local function failure(query_id, code, message)
    return nil, {
        severity = "error",
        code = code,
        message = message,
        query_id = query_id,
    }
end

local function require_string(response, query_id)
    if type(response) ~= "string" then
        return failure(query_id, "DISCOVERY_INVALID_RESPONSE_TYPE",
            "GS I response must be a byte string")
    end
    return response
end

function M.printer_id(response, query_id)
    local data, err = require_string(response, query_id)
    if not data then return nil, err end
    if #data ~= 1 then
        return failure(query_id, "DISCOVERY_INVALID_RESPONSE_LENGTH",
            "printer ID response must contain exactly one byte")
    end
    return string.byte(data)
end

function M.information_b(response, query_id)
    local data, err = require_string(response, query_id)
    if not data then return nil, err end
    if #data < 2 then
        return failure(query_id, "DISCOVERY_INVALID_RESPONSE_LENGTH",
            "printer information B requires a header and NUL terminator")
    end
    if string.byte(data, 1) ~= 0x5F then
        return failure(query_id, "DISCOVERY_INVALID_RESPONSE_HEADER",
            "printer information B must begin with byte 0x5F")
    end

    local terminator = data:find("\0", 2, true)
    if not terminator then
        return failure(query_id, "DISCOVERY_MISSING_TERMINATOR",
            "printer information B is missing its NUL terminator")
    end
    if terminator ~= #data then
        return failure(query_id, "DISCOVERY_TRAILING_RESPONSE_DATA",
            "printer information B contains data after its NUL terminator")
    end

    local payload = data:sub(2, -2)
    if #payload > 80 then
        return failure(query_id, "DISCOVERY_INFORMATION_TOO_LONG",
            "printer information B payload exceeds 80 bytes")
    end
    for index = 1, #payload do
        local byte = string.byte(payload, index)
        if byte < 0x20 or byte > 0x7E then
            return failure(query_id, "DISCOVERY_NON_ASCII_INFORMATION",
                "printer information B contains a non-printable byte")
        end
    end
    return payload
end

return M
