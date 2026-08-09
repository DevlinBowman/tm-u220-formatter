-- Verifies CLI dispatch preserves normalized authoring and delivery options.
local check = require("unit.support")
local Diagnostics = require("tm_u220.core.diagnostics")
local help = require("tm_u220.cli.help")
local run = require("tm_u220.cli.run")

local tests = {}

local function installed_routes()
    return { resolve = function(options)
        options.host = "192.168.50.41"
        options.port = options.delivery == "live" and 9100 or 515
        options.profile_path = "/private/etc/tm-u220/printer.u220p"
        return options
    end }
end

tests[#tests + 1] = { "help makes fast default and controllable live mode visible", function()
    check.contains(help.text, "Fast whole-job LPD (default)")
    check.contains(help.text, "220 print receipt.u220 --live")
    check.contains(help.text, "slower than default LPD")
    check.contains(help.text, "--silent requires --live")
    check.contains(help.text, "--text TEXT")
    check.contains(help.text, "--ftext FTEXT")
    check.contains(help.text, "--formatted-text FTEXT")
    check.contains(help.text, "printf '12345\\n12345\\n@fi' | 220 print")
end }

tests[#tests + 1] = { "setup-printing delegates only to its setup service", function()
    local received, setup_options, print_called, error_text
    local setup_runtime = { marker = true }
    local status = run.main({ "setup-printing" }, {
        setup_printing = {
            run = function(options, runtime)
                setup_options = options
                received = runtime
                return 7, "reviewer failed"
            end,
        },
        setup_printing_runtime = setup_runtime,
        print_service = {
            print = function() print_called = true end,
        },
        write_error = function(value) error_text = value end,
    })
    check.equal(status, 7)
    check.equal(received, setup_runtime)
    check.equal(setup_options.host, nil)
    check.equal(print_called, nil)
    check.equal(error_text, "reviewer failed\n")
end }

tests[#tests + 1] = { "printing-status delegates without setup or printing", function()
    local received, setup_called, print_called
    local status = run.main({ "printing-status", "--json", "--check-device" }, {
        printing_status = { run = function(options)
            received = options
            return 0
        end },
        setup_printing = { run = function() setup_called = true end },
        print_service = { print = function() print_called = true end },
    })
    check.equal(status, 0)
    check.equal(received.json, true)
    check.equal(received.check_device, true)
    check.equal(setup_called, nil)
    check.equal(print_called, nil)
end }

tests[#tests + 1] = { "remove-printing delegates only its explicit flags", function()
    local received, setup_called, print_called
    local status = run.main({ "remove-printing", "--remove", "--json" }, {
        remove_printing = { run = function(options)
            received = options
            return 1
        end },
        setup_printing = { run = function() setup_called = true end },
        print_service = { print = function() print_called = true end },
    })
    check.equal(status, 1)
    check.equal(received.remove, true)
    check.equal(received.json, true)
    check.equal(setup_called, nil)
    check.equal(print_called, nil)
end }

tests[#tests + 1] = { "preview delegates only to the browser editor launcher", function()
    local call, config_facts
    local facts = { marker = true }
    local status = run.main({ "preview", "receipt.u220" }, {
        config_files = { active_path = function(name, received)
            config_facts = received
            return "/user/" .. name
        end },
        config_files_runtime = facts,
        editor_launcher = {
            run = function(input, options)
                call = { input = input, options = options }
                return 0
            end,
        },
    })
    check.equal(status, 0)
    check.equal(config_facts, facts)
    check.equal(call.input, "receipt.u220")
    check.equal(call.options.string_input, nil)
    check.equal(call.options.alias_path, "/user/aliases")
    check.equal(call.options.profile_path, "/user/profile")
end }

tests[#tests + 1] = { "config delegates only to the configuration editor", function()
    local received, error_text
    local config_runtime = { marker = true }
    local status = run.main({ "config" }, {
        config_editor = { run = function(runtime)
            received = runtime
            return 7, "vim could not open configuration"
        end },
        config_runtime = config_runtime,
        write_error = function(value) error_text = value end,
    })
    check.equal(status, 7)
    check.equal(received, config_runtime)
    check.equal(error_text, "vim could not open configuration\n")
end }

tests[#tests + 1] = { "print entry point preserves explicit literal text", function()
    local call, output = nil, {}
    local status = run.main({ "print", "--text", "receipt.u220" }, {
        printing_routes = installed_routes(),
        print_service = {
            print = function(input, options)
                call = { input = input, options = options }
                return {
                    diagnostics = {},
                    compilation = { profile = { id = "local" } },
                    submission = {
                        message = "queued",
                        bytes_submitted = 1,
                    },
                }
            end,
        },
        write = function(...)
            for index = 1, select("#", ...) do
                output[#output + 1] = tostring(select(index, ...))
            end
        end,
    })

    check.equal(status, 0)
    check.equal(call.input, "receipt.u220")
    check.equal(call.options.string_input, "raw")
    check.equal(call.options.delivery, "batch")
    check.equal(call.options.transport, "lpd")
    check.equal(call.options.host, "192.168.50.41")
    check.equal(table.concat(output), "queued\n")
end }

tests[#tests + 1] = { "print entry point preserves formatted string input", function()
    local call
    local status = run.main({ "print", "--ftext", "@emphasis on\nStyled" }, {
        printing_routes = installed_routes(),
        print_service = {
            print = function(input, options)
                call = { input = input, options = options }
                return {
                    diagnostics = {},
                    compilation = { profile = { id = "local" } },
                    submission = { message = "queued", bytes_submitted = 1 },
                }
            end,
        },
        write = function() end,
    })
    check.equal(status, 0)
    check.equal(call.input, "@emphasis on\nStyled")
    check.equal(call.options.string_input, "formatted")
end }

tests[#tests + 1] = { "print entry point delegates implicit standard input", function()
    local call
    local status = run.main({ "print" }, {
        printing_routes = installed_routes(),
        print_service = {
            print = function(input, options)
                call = { input = input, options = options }
                return {
                    diagnostics = {},
                    compilation = { profile = { id = "local" } },
                    submission = { message = "queued", bytes_submitted = 1 },
                }
            end,
        },
        write = function() end,
    })
    check.equal(status, 0)
    check.equal(call.input, "-")
    check.equal(call.options.string_input, nil)
    check.equal(call.options.delivery, "batch")
    check.equal(call.options.transport, "lpd")
end }

tests[#tests + 1] = { "explicit live mode supports silence and cancellation", function()
    local call, output = nil, {}
    local status = run.main({ "print", "receipt.u220", "--live", "--silent" }, {
        printing_routes = installed_routes(),
        print_service = {
            print = function(input, options)
                call = { input = input, options = options }
                return {
                    diagnostics = {},
                    compilation = { profile = { id = "local" } },
                    submission = {
                        message = "cancelled after one line",
                        bytes_submitted = 4,
                        cancelled = true,
                    },
                }
            end,
        },
        write = function(...)
            for index = 1, select("#", ...) do
                output[#output + 1] = tostring(select(index, ...))
            end
        end,
    })
    check.equal(status, 130)
    check.equal(call.options.delivery, "live")
    check.equal(call.options.silent, true)
    check.equal(table.concat(output), "cancelled after one line\n")
end }

tests[#tests + 1] = { "explicit LPD preserves the batch route", function()
    local call
    local status = run.main({
        "print", "receipt.u220", "--transport", "lpd",
    }, {
        printing_routes = installed_routes(),
        print_service = {
            print = function(_, options)
                call = options
                return {
                    diagnostics = {}, compilation = { profile = { id = "local" } },
                    submission = { message = "queued", bytes_submitted = 1 },
                }
            end,
        },
        write = function() end,
    })
    check.equal(status, 0)
    check.equal(call.delivery, "batch")
    check.equal(call.transport, "lpd")
end }

tests[#tests + 1] = { "print route and diagnostic failures use injected stderr", function()
    local errors = {}
    local status = run.main({ "print", "--text", "hello" }, {
        printing_routes = { resolve = function() return nil, "route unavailable" end },
        write_error = function(value) errors[#errors + 1] = value end,
    })
    check.equal(status, 1)
    check.equal(table.concat(errors), "route unavailable\n")

    errors = {}
    status = run.main({ "print", "--text", "hello" }, {
        printing_routes = installed_routes(),
        print_service = { print = function()
            return { diagnostics = {
                Diagnostics.new("PRINT_TEST_FAILURE", "did not submit"),
            } }
        end },
        write_error = function(value) errors[#errors + 1] = value end,
    })
    check.equal(status, 1)
    check.contains(table.concat(errors), "PRINT_TEST_FAILURE")
    check.equal(table.concat(errors):sub(-1), "\n")
end }

return tests
