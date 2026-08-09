-- Validates print-only delivery choices after the generic CLI parser has shaped arguments.
-- Transport policy stays isolated from command tokenization and the shared command catalog.
local M = {}

local function integer_option(value, label, minimum, maximum)
    if value == nil then return nil end
    if not value:match("^%d+$") then return nil, label .. " must be an integer" end
    local number = tonumber(value)
    if number < minimum or number > maximum then
        return nil, string.format("%s must be from %d through %d", label, minimum, maximum)
    end
    return number
end

local function reject_present(options, entries, suffix)
    for _, entry in ipairs(entries) do
        if options[entry[1]] ~= nil then return nil, entry[2] .. suffix end
    end
    return true
end

local function normalize_source_ports(options)
    if options.source_port and options.source_ports_text then
        return nil, "use --source-port or --source-ports, not both"
    end
    if options.legacy_source_ports and (options.source_port or options.source_ports_text) then
        return nil, "--legacy-source-ports cannot be combined with explicit source ports"
    end

    local ports, err = {}, nil
    if options.source_ports_text then
        local value = options.source_ports_text
        if value:find("[^%d,]") or value:match("^,") or value:match(",$")
            or value:find(",,", 1, true) then
            return nil, "--source-ports must be a comma-separated list of integers"
        end
        local seen = {}
        for text in value:gmatch("[^,]+") do
            local port
            port, err = integer_option(text, "--source-ports", 1, 65535)
            if err then return nil, err end
            if seen[port] then return nil, "--source-ports must not contain duplicates" end
            seen[port], ports[#ports + 1] = true, port
        end
    elseif options.source_port then
        ports[1] = options.source_port
    elseif options.legacy_source_ports then
        ports = { 1023, 1022, 1021, 1020, 1019, 1018, 1017, 1016 }
    end
    options.source_ports = #ports > 0 and ports or nil
    return true
end

function M.normalize(result)
    local options, err = result.options
    options.port, err = integer_option(options.port, "--port", 1, 65535)
    if err then return nil, err end
    options.timeout, err = integer_option(options.timeout, "--timeout", 1, 300)
    if err then return nil, err end
    options.source_port, err = integer_option(options.source_port, "--source-port", 1, 65535)
    if err then return nil, err end

    local ok
    ok, err = normalize_source_ports(options)
    if not ok then return nil, err end

    if options.live then
        if options.transport ~= nil then return nil, "--live cannot be combined with --transport" end
        ok, err = reject_present(options, {
            { "host", "--host" }, { "port", "--port" },
            { "source_port", "--source-port" }, { "source_ports_text", "--source-ports" },
            { "legacy_source_ports", "--legacy-source-ports" }, { "sudo", "--sudo" },
        }, " cannot be combined with --live")
        if not ok then return nil, err end
        if options.timeout and options.timeout > 25 then
            return nil, "--timeout for live printing must be from 1 through 25 seconds"
        end
        options.delivery, options.source_ports = "live", nil
        return result
    end

    options.transport = options.transport or "lpd"
    if options.transport ~= "raw-tcp" and options.transport ~= "lpd" then
        return nil, "--transport must be raw-tcp or lpd"
    end
    if options.silent then return nil, "--silent requires --live" end
    options.delivery = "batch"
    if options.transport == "lpd" then
        ok, err = reject_present(options, {
            { "host", "--host" }, { "port", "--port" }, { "timeout", "--timeout" },
            { "source_port", "--source-port" }, { "source_ports_text", "--source-ports" },
            { "legacy_source_ports", "--legacy-source-ports" }, { "sudo", "--sudo" },
        }, " cannot override the installed LPD printing policy")
        if not ok then return nil, err end
        return result
    end
    if not options.host then return nil, "raw-tcp printing requires --host" end
    if options.sudo and not options.source_ports then
        return nil, "--sudo requires --source-port, --source-ports, or --legacy-source-ports"
    end
    return result
end

return M
