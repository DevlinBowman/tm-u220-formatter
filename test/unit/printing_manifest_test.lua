-- Verifies that runtime routes and profiles come only from one strict installed manifest.
local check = require("unit.support")
local Installed = require("tm_u220.printing.installed")
local Manifest = require("tm_u220.printing.manifest")
local Sha256 = require("tm_u220.core.sha256")

local tests = {}

local function bytes(overrides)
    local values = {
        account_name = "other_user", account_uid = "502",
        printer_ipv4 = "192.168.50.41", profile_path = Manifest.PROFILE_PATH,
        profile_bytes = "19", profile_sha256 = string.rep("a", 64),
        probe_mode = "verified", probe_recorded_at = "2026-08-08T12:34:56.789Z",
        probe_model = "TM-U220", probe_model_id = "13",
        probe_acceptance = "allow_offline",
        live_destination_port = "9100", live_timeout_seconds = "30",
        live_source_ports = "1023,1021,1020,1019,1018,1017,1016,1015",
        lpd_queue = "lp", lpd_destination_port = "515", lpd_timeout_seconds = "5",
        lpd_source_ports = "731,730,729,728,727,726,725,724,723,722,721",
    }
    for key, value in pairs(overrides or {}) do values[key] = value end
    local keys = {
        "account_name", "account_uid", "printer_ipv4", "profile_path",
        "profile_bytes", "profile_sha256", "probe_mode", "probe_recorded_at",
    }
    if values.probe_mode == "verified" then
        keys[#keys + 1] = "probe_model"
        keys[#keys + 1] = "probe_model_id"
    elseif values.probe_mode == "offline" then
        keys[#keys + 1] = "probe_error"
        keys[#keys + 1] = "probe_acceptance"
    else
        error("test fixture probe_mode must be verified or offline")
    end
    for _, key in ipairs({ "live_destination_port", "live_timeout_seconds",
        "live_source_ports", "lpd_queue", "lpd_destination_port",
        "lpd_timeout_seconds", "lpd_source_ports" }) do
        keys[#keys + 1] = key
    end
    local lines = { Manifest.HEADER }
    for _, key in ipairs(keys) do lines[#lines + 1] = key .. "=" .. tostring(values[key]) end
    return table.concat(lines, "\n") .. "\n"
end

tests[#tests + 1] = { "installed printing manifest supplies every local route choice", function()
    local policy = assert(Manifest.parse(bytes()))
    check.equal(policy.account.name, "other_user")
    check.equal(policy.account.uid, 502)
    check.equal(policy.host, "192.168.50.41")
    check.equal(policy.routes.live.port, 9100)
    check.equal(policy.routes.live.source_ports[2], 1021)
    check.equal(policy.routes.lpd.queue, "lp")
    check.equal(policy.routes.lpd.source_ports[11], 721)
end }

tests[#tests + 1] = { "printing manifest rejects public endpoints and structural drift", function()
    local value, err = Manifest.parse(bytes({ printer_ipv4 = "8.8.8.8" }))
    check.equal(value, nil)
    check.contains(err, "private or link-local")

    value, err = Manifest.parse(bytes():gsub(
        "account_name=other_user\naccount_uid=502",
        "account_uid=502\naccount_name=other_user"))
    check.equal(value, nil)
    check.contains(err, "order")

    value, err = Manifest.parse(bytes() .. "unknown=value\n")
    check.equal(value, nil)
    check.contains(err, "unknown or malformed")
end }

tests[#tests + 1] = { "verified evidence is closed to the exact supported model", function()
    local value, err = Manifest.parse(bytes({ probe_model = "TM-T88" }))
    check.equal(value, nil)
    check.contains(err, "does not identify")

    local offline = assert(Manifest.parse(bytes({
        probe_mode = "offline", probe_model = nil, probe_model_id = nil,
        probe_error = "timeout",
    })))
    check.equal(offline.probe.mode, "offline")
    check.equal(offline.probe.error, "timeout")
    check.equal(offline.probe.acceptance, "allow_offline")

    value, err = Manifest.parse(bytes({
        probe_mode = "offline", probe_model = nil, probe_model_id = nil,
        probe_error = "timeout", probe_acceptance = "yes",
    }))
    check.equal(value, nil)
    check.contains(err, "explicit allow_offline")
end }

tests[#tests + 1] = { "manifest scalars are canonical and timestamps name real instants", function()
    local value, err = Manifest.parse(bytes({ account_uid = "0502" }))
    check.equal(value, nil)
    check.contains(err, "canonical integer")

    value, err = Manifest.parse(bytes({ live_destination_port = "09100" }))
    check.equal(value, nil)
    check.contains(err, "canonical integer")

    value, err = Manifest.parse(bytes({ probe_recorded_at = "2026-02-29T12:34:56.789Z" }))
    check.equal(value, nil)
    check.contains(err, "UTC ISO-8601")

    check.truthy(Manifest.parse(bytes({ probe_recorded_at = "2024-02-29T23:59:59.999Z" })))
end }

tests[#tests + 1] = { "installed loader binds profile bytes to the manifest length", function()
    local manifest = bytes({ profile_bytes = "7",
        profile_sha256 = Sha256.hex("PROFILE") })
    local files = { manifest = manifest, profile = "PROFILE" }
    local policy = assert(Installed.load({
        manifest_path = "manifest", profile_path = "profile",
        open = function(path)
            local value = files[path]
            if not value then return nil, "missing" end
            return {
                read = function() return value end,
                close = function() return true end,
            }
        end,
    }))
    check.equal(policy.profile_source, "PROFILE")

    local missing, err = Installed.load({
        manifest_path = "missing", open = function() return nil, "not found" end,
    })
    check.equal(missing, nil)
    check.contains(err, "run 220 setup-printing")
end }

tests[#tests + 1] = { "SHA-256 verifier matches standard vectors", function()
    check.equal(Sha256.hex(""),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    check.equal(Sha256.hex("abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
end }

return tests
