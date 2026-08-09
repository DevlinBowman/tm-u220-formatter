-- Verifies that only friendly local routes consume installed machine configuration.
local check = require("unit.support")
local LivePrintService = require("tm_u220.app.live_print_service")
local Routes = require("tm_u220.app.printing_routes")

local tests = {}

local POLICY = {
    profile_path = "/private/etc/tm-u220/printer.u220p",
    profile_bytes = 7,
    profile_sha256 = require("tm_u220.core.sha256").hex("PROFILE"),
    routes = {
        live = { host = "192.168.50.41", port = 9100, timeout = 30,
            source_ports = { 1023, 1021 } },
        lpd = { host = "192.168.50.41", port = 515, timeout = 5,
            source_ports = { 731, 730 }, queue = "lp" },
    },
}

local function runtime()
    return { loader = { load = function() return POLICY end } }
end

local function live_plan()
    return {
        payload_bytes = "A\n",
        payload_byte_count = 2,
        line_count = 1,
        diagnostics = {},
        steps = {
            { index = 1, kind = "line", payload_bytes = "A\n",
                display = "001 | A", preview_line_index = 1,
                reset_after_byte_offsets = {} },
        },
    }
end

local function validated_live_manifest(options)
    local captured
    local submission, failure = LivePrintService.submit({}, options, {
        plan_builder = { build = function() return live_plan() end },
        transport_dependencies = { adapter = { submit = function(manifest)
            captured = manifest
            return {
                status = "completed", source_port = 1023,
                lines_confirmed = 1, steps_confirmed = 1, bytes_submitted = 2,
            }
        end } },
    })
    check.truthy(submission)
    check.equal(failure, nil)
    return captured
end

tests[#tests + 1] = { "local LPD is resolved entirely from installed policy", function()
    local options = assert(Routes.resolve({ transport = "lpd", delivery = "batch" },
        runtime()))
    check.equal(options.host, "192.168.50.41")
    check.equal(options.port, 515)
    check.equal(options.queue, "lp")
    check.equal(options.source_ports[2], 730)
    check.equal(options.profile_path, POLICY.profile_path)
    check.equal(options.printing_policy, POLICY)
end }

tests[#tests + 1] = { "live mode selects the installed live route", function()
    local options = assert(Routes.resolve({ delivery = "live", silent = true }, runtime()))
    check.equal(options.host, "192.168.50.41")
    check.equal(options.port, 9100)
    check.equal(options.source_ports[1], 1023)
    check.equal(options.silent, true)
    check.equal(options.timeout, nil)
    check.equal(options.printing_policy.routes.live.timeout, 30)
end }

tests[#tests + 1] = { "live status timeout remains separate from route connection timeout", function()
    local options = assert(Routes.resolve({ delivery = "live", timeout = 25 }, runtime()))
    local manifest = validated_live_manifest(options)
    check.equal(options.status_timeout_seconds, 25)
    check.equal(options.timeout, nil)
    check.equal(options.printing_policy.routes.live.timeout, 30)
    check.equal(manifest.timeout_ms, 25000)
end }

tests[#tests + 1] = { "resolved live route validates with the default status timeout", function()
    local options = assert(Routes.resolve({ delivery = "live" }, runtime()))
    local manifest = validated_live_manifest(options)
    check.equal(manifest.timeout_ms, 10000)
    check.equal(options.printing_policy.routes.live.timeout, 30)
end }

tests[#tests + 1] = { "local printing has no hardcoded endpoint fallback", function()
    local options, err = Routes.resolve({ transport = "lpd", delivery = "batch" }, {
        loader = { load = function()
            return nil, "printing is not configured; run 220 setup-printing"
        end },
    })
    check.equal(options, nil)
    check.contains(err, "run 220 setup-printing")
end }

tests[#tests + 1] = { "local printing accepts only the installed physical profile", function()
    local options = assert(Routes.resolve({ transport = "lpd", delivery = "batch",
        profile_path = "same.u220p" }, {
        loader = runtime().loader,
        read_profile = function() return "PROFILE" end,
    }))
    check.equal(options.profile_path, POLICY.profile_path)

    local invalid, err = Routes.resolve({ transport = "lpd", delivery = "batch",
        profile_path = "different.u220p" }, {
        loader = runtime().loader,
        read_profile = function() return "DIFFERENT" end,
    })
    check.equal(invalid, nil)
    check.contains(err, "canonical profile")
end }

tests[#tests + 1] = { "advanced raw route never loads local policy", function()
    local called = false
    local options = assert(Routes.resolve({ transport = "raw-tcp", host = "printer.example" }, {
        loader = { load = function() called = true end },
    }))
    check.equal(called, false)
    check.equal(options.host, "printer.example")
end }

return tests
