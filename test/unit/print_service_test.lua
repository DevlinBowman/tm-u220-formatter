-- Verifies that printing submits only successful compiler output to transports.
local check = require("unit.support")
local Diagnostics = require("tm_u220.core.diagnostics")
local PrintService = require("tm_u220.app.print_service")

local tests = {}

tests[#tests + 1] = { "print service accepts resolved literal input", function()
    local compiled_with, submitted
    local jobs = { compile_input = function(value, options)
        compiled_with = { value = value, options = options }
        return { bytes = "PRINT", diagnostics = {}, profile = { id = "local" } }
    end }
    local transport = { submit = function(bytes)
        submitted = bytes
        return { bytes_submitted = #bytes, printer_acceptance = "unknown" }
    end }
    local result = PrintService.print("hello printer", {
        alias_path = "/user/directives/aliases.u220a",
        profile_path = "/user/printers/local.u220p",
        string_input = "raw",
    }, {
        job_service = jobs, transport = transport,
    })
    check.equal(#result.diagnostics, 0)
    check.equal(compiled_with.value, "hello printer")
    check.equal(compiled_with.options.alias_path,
        "/user/directives/aliases.u220a")
    check.equal(compiled_with.options.profile_path,
        "/user/printers/local.u220p")
    check.equal(compiled_with.options.string_input, "raw")
    check.equal(submitted, "PRINT")
end }

tests[#tests + 1] = { "default print input interprets a line directive", function()
    local submitted
    local transport = { submit = function(value)
        submitted = value
        return { bytes_submitted = #value, printer_acceptance = "unknown" }
    end }
    local result = PrintService.print("@cut installed", {}, { transport = transport })
    local cut_commands = 0
    for _, node in ipairs(result.compilation.nodes or {}) do
        if node.kind == "command" and node.id == "mechanism.cut" then
            cut_commands = cut_commands + 1
        end
    end

    check.equal(#result.diagnostics, 0)
    check.equal(cut_commands, 1)
    check.equal(submitted, result.compilation.bytes)
    check.falsy(submitted:find("@cut installed", 1, true))
end }

tests[#tests + 1] = { "plain print input cannot inject a line directive", function()
    local submitted
    local transport = { submit = function(value)
        submitted = value
        return { bytes_submitted = #value, printer_acceptance = "unknown" }
    end }
    local result = PrintService.print(
        "@cut installed", { text = true }, { transport = transport })
    local expected = string.char(0x1B, 0x40) .. "@cut installed\n"

    check.equal(#result.diagnostics, 0)
    check.equal(submitted, expected)
    check.equal(result.compilation.bytes, expected)
end }

tests[#tests + 1] = { "print service submits only exact compiled bytes", function()
    local payload = string.char(0x1B, 0x40, 0x00, 0x41)
    local compile_call, transport_call
    local jobs = { compile = function(path, options)
        compile_call = { path = path, options = options }
        return { bytes = payload, diagnostics = {}, profile = { id = "test" } }
    end }
    local transport = { submit = function(bytes, endpoint, options, dependencies)
        transport_call = {
            bytes = bytes, endpoint = endpoint, options = options,
            dependencies = dependencies,
        }
        return {
            bytes_submitted = #bytes,
            printer_acceptance = "unknown",
        }
    end }
    local transport_dependencies = { marker = "injected" }
    local result = PrintService.print("receipt.u220", {
        host = "printer.local",
        profile_path = "printer.u220p",
        queue = "lp",
        timeout = 7,
        source_ports = { 1023 },
        sudo = true,
    }, {
        job_service = jobs,
        transport = transport,
        transport_dependencies = transport_dependencies,
    })
    check.equal(#result.diagnostics, 0)
    check.equal(compile_call.path, "receipt.u220")
    check.equal(compile_call.options.profile_path, "printer.u220p")
    check.equal(transport_call.bytes, payload)
    check.equal(transport_call.endpoint.host, "printer.local")
    check.equal(transport_call.options.timeout, 7)
    check.equal(transport_call.options.queue, "lp")
    check.equal(transport_call.options.source_ports[1], 1023)
    check.equal(transport_call.options.sudo, true)
    check.equal(transport_call.dependencies, transport_dependencies)
    check.equal(result.submission.bytes_submitted, #payload)
    check.equal(result.submission.printer_acceptance, "unknown")
end }

tests[#tests + 1] = { "print service never sends when compilation has errors", function()
    local transport_calls = 0
    local jobs = { compile = function()
        return {
            bytes = "MUST NOT SEND",
            diagnostics = { Diagnostics.new("TEST_COMPILE_ERROR", "bad job") },
        }
    end }
    local transport = { submit = function()
        transport_calls = transport_calls + 1
        return { printer_acceptance = "unknown" }
    end }
    local result = PrintService.print("bad.u220", { host = "printer" }, {
        job_service = jobs, transport = transport,
    })
    check.equal(transport_calls, 0)
    check.equal(result.diagnostics[1].code, "TEST_COMPILE_ERROR")
    check.equal(result.submission, nil)
end }

tests[#tests + 1] = { "print service never sends missing compiled bytes", function()
    local transport_calls = 0
    local jobs = { compile = function() return { diagnostics = {} } end }
    local transport = { submit = function()
        transport_calls = transport_calls + 1
        return {}
    end }
    local result = PrintService.print("empty.u220", { host = "printer" }, {
        job_service = jobs, transport = transport,
    })
    check.equal(transport_calls, 0)
    check.equal(result.diagnostics[1].code, "PRINT_BYTES_MISSING")
end }

tests[#tests + 1] = { "print service preserves transport diagnostics", function()
    local transport_error = Diagnostics.new(
        "TRANSPORT_SUBMIT_FAILED", "TCP outcome is unknown")
    transport_error.printer_acceptance = "unknown"
    local jobs = { compile = function()
        return { bytes = "BYTES", diagnostics = {} }
    end }
    local transport = { submit = function() return nil, transport_error end }
    local result = PrintService.print("receipt.u220", { host = "printer" }, {
        job_service = jobs, transport = transport,
    })
    check.equal(result.submission, nil)
    check.equal(result.diagnostics[1], transport_error)
    check.equal(result.diagnostics[1].printer_acceptance, "unknown")
end }

tests[#tests + 1] = { "live print service receives compilation metadata without batch submission", function()
    local live_call, batch_calls = nil, 0
    local jobs = { compile_input = function()
        return {
            bytes = "A\n", diagnostics = {}, profile = { id = "test" },
            nodes = {}, encoded_parts = {}, print_boundaries = {}, preview_lines = {},
        }
    end }
    local live = { submit = function(compilation, options)
        live_call = { compilation = compilation, options = options }
        return {
            transport = "live-raw", status = "completed",
            message = "printed", bytes_submitted = 2,
        }, nil, { steps = {} }
    end }
    local result = PrintService.print("receipt.u220", {
        delivery = "live", silent = true,
    }, {
        job_service = jobs,
        live_service = live,
        transport = { submit = function() batch_calls = batch_calls + 1 end },
    })
    check.equal(#result.diagnostics, 0)
    check.equal(batch_calls, 0)
    check.equal(live_call.compilation.bytes, "A\n")
    check.equal(live_call.options.silent, true)
    check.equal(result.submission.transport, "live-raw")
end }

tests[#tests + 1] = { "live failure never falls back to a whole-payload transport", function()
    local batch_calls = 0
    local failure = Diagnostics.new(
        "LIVE_CHECKPOINT_FAILED", "line outcome is unknown")
    local result = PrintService.print("receipt.u220", { delivery = "live" }, {
        job_service = { compile_input = function()
            return { bytes = "A\n", diagnostics = {}, profile = { id = "test" } }
        end },
        live_service = { submit = function() return nil, failure end },
        transport = { submit = function()
            batch_calls = batch_calls + 1
            return { message = "must not run" }
        end },
    })
    check.equal(batch_calls, 0)
    check.equal(result.submission, nil)
    check.equal(result.diagnostics[1], failure)
end }

tests[#tests + 1] = { "live print service rejects a malformed success result", function()
    local result = PrintService.print("receipt.u220", { delivery = "live" }, {
        job_service = { compile_input = function()
            return { bytes = "A\n", diagnostics = {}, profile = { id = "test" } }
        end },
        live_service = { submit = function() return "not a submission" end },
    })
    check.equal(result.submission, nil)
    check.equal(result.diagnostics[1].code, "LIVE_SERVICE_FAILED")
end }

return tests
