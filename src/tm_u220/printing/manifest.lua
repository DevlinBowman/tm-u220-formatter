-- Parses the root-owned printing manifest that is the runtime authority for local routes.
-- It rejects drifted or ambiguous bytes before any printer transport is selected.
local M = {}
local Validation = require("tm_u220.printing.validation")

M.HEADER = "!tm-u220 printing-policy 1"
M.INSTALLED_PATH = "/private/etc/tm-u220/printing.conf"
M.PROFILE_PATH = "/private/etc/tm-u220/printer.u220p"

local BASE_KEYS = {
    "account_name", "account_uid", "printer_ipv4", "profile_path",
    "profile_bytes", "profile_sha256", "probe_mode", "probe_recorded_at",
}
local ROUTE_KEYS = {
    "live_destination_port", "live_timeout_seconds", "live_source_ports",
    "lpd_queue", "lpd_destination_port", "lpd_timeout_seconds", "lpd_source_ports",
}
local CONDITIONAL_KEYS = {
    verified = { "probe_model", "probe_model_id" },
    offline = { "probe_error", "probe_acceptance" },
    deferred = { "probe_reason" },
}
local LIVE_SOURCE_PORTS = { 1023, 1021, 1020, 1019, 1018, 1017, 1016, 1015 }
local LPD_SOURCE_PORTS = { 731, 730, 729, 728, 727, 726, 725, 724, 723, 722, 721 }
local ALLOWED_KEYS = {}
for _, key in ipairs(BASE_KEYS) do ALLOWED_KEYS[key] = true end
for _, key in ipairs(ROUTE_KEYS) do ALLOWED_KEYS[key] = true end
for _, keys in pairs(CONDITIONAL_KEYS) do
    for _, key in ipairs(keys) do ALLOWED_KEYS[key] = true end
end

local function ports(value, label, minimum, maximum)
    if type(value) ~= "string" or value == "" or value:find("[^%d,]")
        or value:match("^,") or value:match(",$") or value:find(",,", 1, true) then
        return nil, label .. " must be a comma-separated port list"
    end
    local result, seen = {}, {}
    for text in value:gmatch("[^,]+") do
        local port, err = Validation.integer(text, label, minimum, maximum)
        if not port then return nil, err end
        if seen[port] then return nil, label .. " must not contain duplicates" end
        seen[port], result[#result + 1] = true, port
        if #result > 32 then return nil, label .. " contains too many ports" end
    end
    return result
end

local function expected_order(mode)
    local conditional = CONDITIONAL_KEYS[mode]
    if not conditional then return nil end
    local result = {}
    for _, key in ipairs(BASE_KEYS) do result[#result + 1] = key end
    for _, key in ipairs(conditional) do result[#result + 1] = key end
    for _, key in ipairs(ROUTE_KEYS) do result[#result + 1] = key end
    return result
end

local function same_list(first, second)
    if #first ~= #second then return false end
    for index, value in ipairs(first) do
        if value ~= second[index] then return false end
    end
    return true
end

local function lines(value)
    if type(value) ~= "string" or value == "" then return nil, "printing manifest is empty" end
    if #value > 4096 then return nil, "printing manifest exceeds 4096 bytes" end
    if value:find("[\0\r]") then return nil, "printing manifest contains forbidden bytes" end
    if value:sub(-1) ~= "\n" then return nil, "printing manifest must end with LF" end
    local result = {}
    for line in value:gmatch("([^\n]*)\n") do result[#result + 1] = line end
    if result[1] ~= M.HEADER then return nil, "printing manifest header is invalid" end
    table.remove(result, 1)
    return result
end

function M.parse(value)
    local source, err = lines(value)
    if not source then return nil, err end
    local fields, order = {}, {}
    for index, line in ipairs(source) do
        local key, field = line:match("^([a-z][a-z0-9_]*)=(.+)$")
        if not key or not ALLOWED_KEYS[key] then
            return nil, "printing manifest line " .. (index + 1) .. " is unknown or malformed"
        end
        if fields[key] ~= nil then return nil, "duplicate printing manifest field: " .. key end
        fields[key], order[index] = field, key
    end
    local expected = expected_order(fields.probe_mode)
    if not expected or #order ~= #expected then
        return nil, "printing manifest fields do not match its probe mode"
    end
    for index, key in ipairs(expected) do
        if order[index] ~= key then return nil, "printing manifest field order is not canonical" end
    end

    if not fields.account_name:match("^[A-Za-z_][A-Za-z0-9_.-]*$")
        or #fields.account_name > 64 then
        return nil, "account_name is not a safe local account name"
    end
    local uid
    uid, err = Validation.integer(fields.account_uid, "account_uid", 1, 2147483647)
    if not uid then return nil, err end
    local host
    host, err = Validation.ipv4(fields.printer_ipv4)
    if not host then return nil, err end
    if fields.profile_path ~= M.PROFILE_PATH then
        return nil, "profile_path does not name the installed printer profile"
    end
    local profile_bytes
    profile_bytes, err = Validation.integer(fields.profile_bytes, "profile_bytes", 1, 4096)
    if not profile_bytes then return nil, err end
    if not fields.profile_sha256:match("^[0-9a-f]+$") or #fields.profile_sha256 ~= 64 then
        return nil, "profile_sha256 must be a lowercase SHA-256 digest"
    end
    if not Validation.timestamp(fields.probe_recorded_at) then
        return nil, "probe_recorded_at must be a UTC ISO-8601 timestamp"
    end
    if fields.probe_mode == "verified"
        and (fields.probe_model ~= "TM-U220" or fields.probe_model_id ~= "13") then
        return nil, "verified probe evidence does not identify a TM-U220"
    end
    if fields.probe_mode == "offline" and not ({ timeout = true,
        connection_refused = true, unreachable = true, network_error = true })
        [fields.probe_error] then
        return nil, "offline probe evidence has an unknown error"
    end
    if fields.probe_mode == "offline" and fields.probe_acceptance ~= "allow_offline" then
        return nil, "offline probe evidence lacks explicit allow_offline acceptance"
    end
    if fields.probe_mode == "deferred"
        and fields.probe_reason ~= "privileged_source_required" then
        return nil, "deferred device check must require the privileged source route"
    end

    local live_port, live_timeout, lpd_port, lpd_timeout
    live_port, err = Validation.integer(fields.live_destination_port,
        "live_destination_port", 1, 65535)
    if not live_port then return nil, err end
    live_timeout, err = Validation.integer(fields.live_timeout_seconds,
        "live_timeout_seconds", 1, 300)
    if not live_timeout then return nil, err end
    local live_sources
    live_sources, err = ports(fields.live_source_ports, "live_source_ports", 1, 1023)
    if not live_sources then return nil, err end
    if fields.lpd_queue ~= "lp" then return nil, "lpd_queue must be lp" end
    lpd_port, err = Validation.integer(fields.lpd_destination_port,
        "lpd_destination_port", 1, 65535)
    if not lpd_port then return nil, err end
    lpd_timeout, err = Validation.integer(fields.lpd_timeout_seconds,
        "lpd_timeout_seconds", 1, 300)
    if not lpd_timeout then return nil, err end
    local lpd_sources
    lpd_sources, err = ports(fields.lpd_source_ports, "lpd_source_ports", 721, 731)
    if not lpd_sources then return nil, err end
    if live_port ~= 9100 or live_timeout ~= 30
        or not same_list(live_sources, LIVE_SOURCE_PORTS)
        or lpd_port ~= 515 or lpd_timeout ~= 5
        or not same_list(lpd_sources, LPD_SOURCE_PORTS) then
        return nil, "printing routes differ from the fixed product policy"
    end

    return {
        account = { name = fields.account_name, uid = uid },
        host = host,
        profile_path = fields.profile_path,
        profile_bytes = profile_bytes,
        profile_sha256 = fields.profile_sha256,
        probe = { mode = fields.probe_mode, recorded_at = fields.probe_recorded_at,
            model = fields.probe_model, model_id = tonumber(fields.probe_model_id),
            error = fields.probe_error, acceptance = fields.probe_acceptance,
            reason = fields.probe_reason },
        routes = {
            live = { host = host, port = live_port, timeout = live_timeout,
                source_ports = live_sources },
            lpd = { host = host, port = lpd_port, timeout = lpd_timeout,
                source_ports = lpd_sources, queue = fields.lpd_queue },
        },
        fields = fields,
    }
end

return M
