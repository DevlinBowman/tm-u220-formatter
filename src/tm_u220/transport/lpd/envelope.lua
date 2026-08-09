local M = {}

local function is_integer(value)
    return type(value) == "number" and value == math.floor(value)
end

local function token(value, label, maximum)
    if type(value) ~= "string" or value == "" then
        return nil, label .. " is required"
    end
    if #value > maximum then
        return nil, string.format("%s must be at most %d bytes", label, maximum)
    end
    if not value:match("^[A-Za-z0-9._-]+$") then
        return nil, label .. " contains unsupported characters"
    end
    return value
end

local function source_name(value)
    if type(value) ~= "string" or value == "" then
        return nil, "source name is required"
    end
    if #value > 131 then return nil, "source name must be at most 131 bytes" end
    for index = 1, #value do
        local byte = value:byte(index)
        if byte < 0x20 or byte > 0x7E then
            return nil, "source name must contain only printable ASCII"
        end
    end
    return value
end

function M.build(payload, options)
    if options == nil then options = {} end
    if type(options) ~= "table" then return nil, "envelope options must be a table" end
    if type(payload) ~= "string" then return nil, "payload must be a byte string" end
    if payload == "" then return nil, "refusing to submit an empty payload" end

    local queue, err = token(options.queue or "lp", "queue", 32)
    if not queue then return nil, err end
    local client_host
    client_host, err = token(options.client_host or "tm-u220", "client host", 31)
    if not client_host then return nil, err end
    local user
    user, err = token(options.user or "tm-u220", "user", 31)
    if not user then return nil, err end
    if user:match("^%d") then return nil, "user must not start with a digit" end
    local name
    name, err = source_name(options.source_name or "tm-u220")
    if not name then return nil, err end

    local job_id = options.job_id
    if not is_integer(job_id) or job_id < 0 or job_id > 999 then
        return nil, "job id must be an integer from 0 through 999"
    end
    local suffix = string.format("%03d%s", job_id, client_host)
    local data_name = "dfA" .. suffix
    local control_name = "cfA" .. suffix
    local control = table.concat({
        "H", client_host, "\n",
        "P", user, "\n",
        "l", data_name, "\n",
        "U", data_name, "\n",
        "N", name, "\n",
    })

    return {
        queue = queue,
        client_host = client_host,
        user = user,
        source_name = name,
        job_id = job_id,
        data_name = data_name,
        control_name = control_name,
        control = control,
        control_size = #control,
        payload = payload,
        payload_size = #payload,
    }
end

return M
