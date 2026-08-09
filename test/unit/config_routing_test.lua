-- Verifies user authoring configuration reaches authoring and advanced printing routes.
-- Managed local printing still resolves its physical profile from installed machine policy.
local check = require("unit.support")
local run = require("tm_u220.cli.run")

local tests = {}

local USER_ALIASES = "/user/directives/aliases.u220a"
local USER_PROFILE = "/user/printers/local.u220p"
local USER_IMAGE_PROFILE = "/user/images/default.u220i"
local POLICY_PROFILE = "/private/etc/tm-u220/printer.u220p"
local POLICY = {
    profile_path = POLICY_PROFILE,
    routes = {
        lpd = { host = "192.168.50.41", port = 515, queue = "lp",
            timeout = 5, source_ports = { 731 } },
        live = { host = "192.168.50.41", port = 9100,
            timeout = 30, source_ports = { 1023 } },
    },
}

local function config_files()
    return { active_path = function(name)
        if name == "aliases" then return USER_ALIASES end
        if name == "profile" then return USER_PROFILE end
        return USER_IMAGE_PROFILE
    end }
end

local function successful_submission()
    return {
        diagnostics = {},
        compilation = { profile = { id = "configured" } },
        submission = { message = "queued", bytes_submitted = 1 },
    }
end

tests[#tests + 1] = { "preview keeps user aliases when an explicit profile wins", function()
    local received
    local status = run.main({
        "preview", "receipt.u220", "--profile", "/explicit/profile.u220p",
    }, {
        config_files = config_files(),
        editor_launcher = { run = function(_, options)
            received = options
            return 0
        end },
    })

    check.equal(status, 0)
    check.equal(received.alias_path, USER_ALIASES)
    check.equal(received.profile_path, "/explicit/profile.u220p")
    check.equal(received.image_profile_path, USER_IMAGE_PROFILE)
end }

tests[#tests + 1] = { "advanced raw printing uses user authoring configuration", function()
    local submitted_options
    local status = run.main({
        "print", "receipt.u220", "--transport", "raw-tcp",
        "--host", "printer.example",
    }, {
        config_files = config_files(),
        printing_routes_runtime = { loader = { load = function()
            error("raw printing must not load installed policy")
        end } },
        print_service = { print = function(_, options)
            submitted_options = options
            return successful_submission()
        end },
        write = function() end,
    })

    check.equal(status, 0)
    check.equal(submitted_options.alias_path, USER_ALIASES)
    check.equal(submitted_options.profile_path, USER_PROFILE)
    check.equal(submitted_options.image_profile_path, USER_IMAGE_PROFILE)
end }

tests[#tests + 1] = { "managed printing keeps aliases but uses installed profile policy", function()
    local submitted_options
    local status = run.main({ "print", "receipt.u220" }, {
        config_files = config_files(),
        printing_routes_runtime = { loader = { load = function() return POLICY end } },
        print_service = { print = function(_, options)
            submitted_options = options
            return successful_submission()
        end },
        write = function() end,
    })

    check.equal(status, 0)
    check.equal(submitted_options.alias_path, USER_ALIASES)
    check.equal(submitted_options.profile_path, POLICY_PROFILE)
    check.equal(submitted_options.image_profile_path, USER_IMAGE_PROFILE)
    check.equal(submitted_options.printing_policy, POLICY)
end }

tests[#tests + 1] = { "invalid managed configuration roots fail before authoring work", function()
    local called, errors = false, {}
    local status = run.main({ "check", "--text", "hello" }, {
        config_files_runtime = {
            project_root = "/release",
            managed_release = true,
            getenv = function(name)
                if name == "XDG_CONFIG_HOME" then return "relative" end
                if name == "HOME" then return "/Users/example" end
            end,
        },
        job_service = { compile_input = function() called = true end },
        write_error = function(value) errors[#errors + 1] = value end,
    })

    check.equal(status, 1)
    check.equal(called, false)
    check.contains(table.concat(errors), "AUTHORING_CONFIG_PATH_INVALID")
    check.contains(table.concat(errors), "XDG_CONFIG_HOME must be an absolute path")
end }

return tests
