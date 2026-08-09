-- Verifies CLI command validation and transport option normalization.
local check = require("unit.support")
local commands = require("tm_u220.cli.commands")
local handlers = require("tm_u220.cli.handlers")
local options = require("tm_u220.cli.options")
local parse = require("tm_u220.cli.parse")

local tests = {}

tests[#tests + 1] = { "configuration and directive reference commands stay argument-free", function()
    check.equal(assert(parse.parse({ "config" })).command, "config")
    check.equal(assert(parse.parse({ "directives" })).command, "directives")
    for _, command in ipairs({ "config", "directives" }) do
        local value, err = parse.parse({ command, "extra" })
        check.equal(value, nil)
        check.contains(err, "expects 0 arguments")
    end
end }

tests[#tests + 1] = { "setup-printing accepts only explicit machine configuration", function()
    local value = assert(parse.parse({ "setup-printing", "--host", "192.168.50.41",
        "--profile", "printer.u220p" }))
    check.equal(value.command, "setup-printing")
    check.equal(value.input, nil)
    check.equal(value.options.transport, nil)
    check.equal(value.options.delivery, nil)

    local invalid, err = parse.parse({ "setup-printing", "extra" })
    check.equal(invalid, nil)
    check.contains(err, "expects 0 arguments")
    check.equal(value.options.host, "192.168.50.41")
    check.equal(value.options.profile_path, "printer.u220p")
    invalid, err = parse.parse({ "setup-printing", "--allow-offline" })
    check.equal(invalid, nil)
    check.contains(err, "unknown option: --allow-offline")
    for _, option in ipairs({ "--verbose", "--live", "--silent", "--transport" }) do
        local argv = { "setup-printing", option }
        if option == "--transport" then argv[#argv + 1] = "lpd" end
        invalid, err = parse.parse(argv)
        check.equal(invalid, nil)
        check.contains(err, "is not accepted with setup-printing")
    end
    invalid, err = parse.parse({ "setup-printing", "--ftext", "Styled" })
    check.equal(invalid, nil)
    check.contains(err, "is not accepted with setup-printing")

    invalid, err = parse.parse({ "setup-printing", "--host", "printer.local" })
    check.equal(invalid, nil)
    check.contains(err, "four canonical decimal octets")
    local partial = assert(parse.parse({ "setup-printing", "--host", "169.254.20.30" }))
    check.equal(partial.options.host, "169.254.20.30")
end }

tests[#tests + 1] = { "printing-status is read-only and explicitly scopes device I/O", function()
    local value = assert(parse.parse({ "printing-status", "--json", "--check-device" }))
    check.equal(value.command, "printing-status")
    check.equal(value.options.json, true)
    check.equal(value.options.check_device, true)
    local invalid, err = parse.parse({ "printing-status", "--host", "192.168.50.41" })
    check.equal(invalid, nil)
    check.contains(err, "is not accepted with printing-status")
end }

tests[#tests + 1] = { "remove-printing requires the explicit mutation flag", function()
    local dry = assert(parse.parse({ "remove-printing", "--json" }))
    check.equal(dry.options.json, true)
    check.equal(dry.options.remove, nil)
    local mutating = assert(parse.parse({ "remove-printing", "--remove", "--json" }))
    check.equal(mutating.options.remove, true)
    local invalid, err = parse.parse({ "remove-printing", "--host", "192.168.50.41" })
    check.equal(invalid, nil)
    check.contains(err, "is not accepted with remove-printing")
end }

tests[#tests + 1] = { "preview accepts one file and its profile option", function()
    local value = assert(parse.parse({ "preview", "receipt.u220",
        "--profile", "printer.u220p" }))
    check.equal(value.input, "receipt.u220")
    check.equal(value.options.string_input, nil)
    check.equal(value.options.profile_path, "printer.u220p")
end }

tests[#tests + 1] = { "print CLI selects LPD without copying machine policy", function()
    local value = assert(parse.parse({ "print", "receipt.u220" }))
    check.equal(value.options.delivery, "batch")
    check.equal(value.options.transport, "lpd")
    check.equal(value.options.host, nil)
    check.equal(value.options.port, nil)
    check.equal(value.options.queue, nil)
    check.equal(value.options.source_ports, nil)
    check.equal(value.options.sudo, nil)
end }

tests[#tests + 1] = { "live explicitly enables mirrored controllable delivery", function()
    local value = assert(parse.parse({
        "print", "receipt.u220", "--live", "--silent", "--verbose",
    }))
    check.equal(value.options.delivery, "live")
    check.equal(value.options.live, true)
    check.equal(value.options.silent, true)
    check.equal(value.options.verbose, true)
    check.equal(value.options.transport, nil)
    check.equal(value.options.host, nil)
    check.equal(value.options.port, nil)

    local invalid, err = parse.parse({ "render", "receipt.u220", "--silent" })
    check.equal(invalid, nil)
    check.contains(err, "is not accepted with render")

    invalid, err = parse.parse({
        "print", "receipt.u220", "--silent",
    })
    check.equal(invalid, nil)
    check.contains(err, "requires --live")

    invalid, err = parse.parse({
        "print", "receipt.u220", "--live", "--transport", "lpd",
    })
    check.equal(invalid, nil)
    check.contains(err, "cannot be combined")

    invalid, err = parse.parse({ "render", "receipt.u220", "--live" })
    check.equal(invalid, nil)
    check.contains(err, "is not accepted with render")
end }

tests[#tests + 1] = { "live timeout stays below the netcat safety timeout", function()
    local value = assert(parse.parse({
        "print", "receipt.u220", "--live", "--timeout", "25",
    }))
    check.equal(value.options.timeout, 25)

    local invalid, err = parse.parse({
        "print", "receipt.u220", "--live", "--timeout", "26",
    })
    check.equal(invalid, nil)
    check.contains(err, "1 through 25")

    local batch = assert(parse.parse({
        "print", "receipt.u220", "--transport", "raw-tcp",
        "--host", "printer.local", "--timeout", "300",
    }))
    check.equal(batch.options.timeout, 300)
end }

tests[#tests + 1] = { "live rejects batch transport plumbing", function()
    local invalid, err = parse.parse({
        "print", "receipt.u220", "--live", "--host", "192.168.50.41",
    })
    check.equal(invalid, nil)
    check.contains(err, "cannot be combined with --live")

    invalid, err = parse.parse({ "print", "receipt.u220", "--live", "--queue", "lp" })
    check.equal(invalid, nil)
    check.contains(err, "--queue is a legacy option")
end }

tests[#tests + 1] = { "raw TCP remains an explicit advanced transport", function()
    local value = assert(parse.parse({
        "print", "receipt.u220", "--transport", "raw-tcp",
        "--host", "printer.local",
    }))
    check.equal(value.options.port, nil)
    check.equal(value.options.timeout, nil)
    check.equal(value.options.source_ports, nil)
    check.equal(value.options.sudo, nil)
    check.equal(value.options.transport, "raw-tcp")

    local invalid, err = parse.parse({
        "print", "receipt.u220", "--transport", "raw-tcp",
    })
    check.equal(invalid, nil)
    check.contains(err, "requires --host")
end }

tests[#tests + 1] = { "print CLI defers every LPD route value to installed policy", function()
    local value = assert(parse.parse({
        "print", "receipt.u220", "--transport", "lpd",
    }))
    check.equal(value.options.transport, "lpd")
    check.equal(value.options.host, nil)
    check.equal(value.options.queue, nil)
    check.equal(value.options.source_ports, nil)
    check.equal(value.options.port, nil)
end }

tests[#tests + 1] = { "LPD host cannot override installed policy", function()
    local value, err = parse.parse({
        "print", "receipt.u220", "--transport", "lpd",
        "--host", "printer.local",
    })
    check.equal(value, nil)
    check.contains(err, "cannot override the installed LPD printing policy")
end }

tests[#tests + 1] = { "local LPD queue is fixed", function()
    local value, err = parse.parse({
        "print", "receipt.u220", "--transport", "lpd", "--queue", "another",
    })
    check.equal(value, nil)
    check.contains(err, "--queue is a legacy option")
end }

tests[#tests + 1] = { "authoring commands share friendly input candidates", function()
    for _, command in ipairs({ "check", "compile", "render", "print" }) do
        local document = assert(parse.parse({ command, "notes and ideas.txt" }))
        check.equal(document.input, "notes and ideas.txt")
        check.equal(document.options.string_input, nil)

        local literal = assert(parse.parse({ command, "hello printer" }))
        check.equal(literal.input, "hello printer")
        check.equal(literal.options.string_input, nil)

        local strict = assert(parse.parse({ command, "receipt.u220" }))
        check.equal(strict.input, "receipt.u220")
        check.equal(strict.options.string_input, nil)
    end
end }

tests[#tests + 1] = { "text and ftext consume explicit authoring strings", function()
    for _, command in ipairs({ "check", "compile", "render", "print" }) do
        local raw = assert(parse.parse({
            command, "--text", "receipt.u220",
        }))
        check.equal(raw.input, "receipt.u220")
        check.equal(raw.options.string_input, "raw")

        local interpreted = assert(parse.parse({
            command, "--ftext", "@emphasis on\nStyled",
        }))
        check.equal(interpreted.input, "@emphasis on\nStyled")
        check.equal(interpreted.options.string_input, "formatted")
    end

    local long = assert(parse.parse({
        "render", "--formatted-text", "@emphasis on\nStyled",
    }))
    check.equal(long.options.string_input, "formatted")
end }

tests[#tests + 1] = { "string input types are mutually exclusive and scoped", function()
    local value, err = parse.parse({
        "render", "--text", "hello", "--ftext", "@line",
    })
    check.equal(value, nil)
    check.contains(err, "use --text or --ftext, not both")

    value, err = parse.parse({ "inspect", "--ftext", "@line" })
    check.equal(value, nil)
    check.contains(err, "--ftext is not accepted with inspect")

    value, err = parse.parse({ "preview", "--text", "notes.txt" })
    check.equal(value, nil)
    check.contains(err, "--text is not accepted with preview")

    value, err = parse.parse({
        "render", "receipt.u220", "--text", "literal",
    })
    check.equal(value, nil)
    check.contains(err, "choose exactly one")

    value, err = parse.parse({ "render", "--ftext" })
    check.equal(value, nil)
    check.contains(err, "--ftext requires a value")

    value, err = parse.parse({ "render", "--directives", "@line" })
    check.equal(value, nil)
    check.contains(err, "unknown option: --directives")
end }

tests[#tests + 1] = { "print CLI keeps LPD-only options compartmentalized", function()
    local invalid_queue, queue_err = parse.parse({
        "print", "receipt.u220", "--transport", "raw-tcp",
        "--host", "printer", "--queue", "lp",
    })
    check.equal(invalid_queue, nil)
    check.contains(queue_err, "--queue is a legacy option")

    local invalid_legacy, legacy_err = parse.parse({
        "print", "receipt.u220", "--host", "printer", "--transport", "lpd",
        "--legacy-source-ports",
    })
    check.equal(invalid_legacy, nil)
    check.contains(legacy_err, "cannot override the installed LPD printing policy")
end }

tests[#tests + 1] = { "print CLI validates transport and LPD queue", function()
    local invalid_transport, transport_err = parse.parse({
        "print", "receipt.u220", "--host", "printer", "--transport", "cups",
    })
    check.equal(invalid_transport, nil)
    check.contains(transport_err, "raw-tcp or lpd")

    local invalid_queue, queue_err = parse.parse({
        "print", "receipt.u220", "--host", "printer", "--transport", "lpd",
        "--queue", "bad queue",
    })
    check.equal(invalid_queue, nil)
    check.contains(queue_err, "--queue is a legacy option")
end }

tests[#tests + 1] = { "print CLI exposes explicit legacy source ports", function()
    local value = assert(parse.parse({
        "print", "receipt.u220", "--transport", "raw-tcp",
        "--host", "printer.local",
        "--legacy-source-ports", "--sudo",
    }))
    check.equal(#value.options.source_ports, 8)
    check.equal(value.options.source_ports[1], 1023)
    check.equal(value.options.source_ports[8], 1016)
    check.equal(value.options.sudo, true)
end }

tests[#tests + 1] = { "print CLI validates source port lists", function()
    local value = assert(parse.parse({
        "print", "receipt.u220", "--transport", "raw-tcp",
        "--host", "printer.local",
        "--source-ports", "1023,1022",
    }))
    check.equal(value.options.source_ports[2], 1022)
    local invalid, err = parse.parse({
        "print", "receipt.u220", "--transport", "raw-tcp",
        "--host", "printer.local",
        "--source-ports", "1023,,1022",
    })
    check.equal(invalid, nil)
    check.contains(err, "comma-separated")
end }

tests[#tests + 1] = { "removed commands are not retained as compatibility aliases", function()
    for _, argv in ipairs({ { "emulate", "stream.bin" }, { "edit", "receipt.u220" } }) do
        local value, err = parse.parse(argv)
        check.equal(value, nil)
        check.contains(err, "unknown command")
    end
end }

tests[#tests + 1] = { "authoring commands accept implicit and explicit standard input", function()
    for _, command in ipairs({ "check", "compile", "render", "print" }) do
        local implicit = assert(parse.parse({ command }))
        check.equal(implicit.input, "-")
        check.equal(implicit.implicit_stdin, true)
        check.equal(implicit.options.input_kind, "job")
        check.equal(implicit.options.string_input, nil)

        local explicit = assert(parse.parse({ command, "-" }))
        check.equal(explicit.input, "-")
        check.equal(explicit.implicit_stdin, nil)
        check.equal(explicit.options.input_kind, "job")
        check.equal(explicit.options.string_input, nil)
    end

    local value, err = parse.parse({ "preview", "-" })
    check.equal(value, nil)
    check.contains(err, "standard input is not supported")

    value, err = parse.parse({ "print", "first", "second" })
    check.equal(value, nil)
    check.contains(err, "expects zero or one input")
end }

tests[#tests + 1] = { "profile decode accepts only raw or hexadecimal responses", function()
    for _, kind in ipairs({ "raw", "hex" }) do
        local value = assert(parse.parse({
            "profile-decode", "gs_i.type_id", "response.bin", "--input", kind,
        }))
        check.equal(value.options.input_kind, kind)
    end
    local value, err = parse.parse({
        "profile-decode", "gs_i.type_id", "response.bin", "--input", "job",
    })
    check.equal(value, nil)
    check.contains(err, "must be raw or hex")

    value, err = parse.parse({
        "profile-decode", "gs_i.not_real", "missing-response.bin",
    })
    check.equal(value, nil)
    check.contains(err, "gs_i.not_real")
    check.contains(err, "220 profile-queries")
end }

tests[#tests + 1] = { "root metadata is exclusive and version stays root-scoped", function()
    local failures = {
        { { "--help", "--version" }, "use --help or --version" },
        { { "--version", "--help" }, "use --help or --version" },
        { { "--help", "--help" }, "duplicate option" },
        { { "-h", "--help" }, "duplicate option" },
        { { "--version", "--version" }, "duplicate option" },
        { { "compile", "--version" }, "accepted only before a command" },
    }
    for _, case in ipairs(failures) do
        local value, err = parse.parse(case[1])
        check.equal(value, nil)
        check.contains(err, case[2])
    end
    check.equal(assert(parse.parse({ "--version" })).command, "version")
    check.equal(assert(parse.parse({ "version" })).command, "version")
end }

tests[#tests + 1] = { "grouped command aliases preserve canonical dispatch", function()
    local cases = {
        { { "printer", "setup" }, "setup-printing" },
        { { "printer", "status" }, "printing-status" },
        { { "printer", "deauthorize" }, "remove-printing" },
        { { "profile", "queries" }, "profile-queries" },
        { { "profile", "decode", "gs_i.type_id", "response.hex" }, "profile-decode" },
    }
    for _, case in ipairs(cases) do
        local value = assert(parse.parse(case[1]))
        check.equal(value.command, case[2])
    end
end }

tests[#tests + 1] = { "option boundaries preserve leading-dash values", function()
    local literal = assert(parse.parse({ "render", "--text", "-hello" }))
    check.equal(literal.input, "-hello")
    local option_text = assert(parse.parse({ "render", "--text", "--", "--json" }))
    check.equal(option_text.input, "--json")
    local positional = assert(parse.parse({ "render", "--", "-hello" }))
    check.equal(positional.input, "-hello")
    local output = assert(parse.parse({ "compile", "hello", "-o", "-" }))
    check.equal(output.options.output, "-")
end }

tests[#tests + 1] = { "rules accepts an optional single topic", function()
    local index = assert(parse.parse({ "rules" }))
    check.equal(index.command, "rules")
    check.equal(index.topic, nil)

    local focused = assert(parse.parse({ "rules", "directives" }))
    check.equal(focused.command, "rules")
    check.equal(focused.topic, "directives")
end }

tests[#tests + 1] = { "rules rejects extra topics with useful guidance", function()
    local value, err = parse.parse({ "rules", "job", "profile" })
    check.equal(value, nil)
    check.contains(err, "rules expects zero or one topic")
end }

tests[#tests + 1] = { "CLI catalog preserves structural invariants", function()
    local seen = {}
    for _, definition in pairs(options.definitions) do
        for _, token in ipairs(definition.tokens) do
            check.falsy(seen[token], "duplicate option token " .. token)
            seen[token] = true
            check.equal(options.from_token(token), definition)
        end
    end
    for _, name in ipairs(commands.order) do
        local definition = assert(commands.get(name))
        check.truthy(definition.usage)
        check.truthy(definition.summary)
        check.truthy(handlers.get(name), "missing handler for " .. name)
    end
    for _, group in pairs(commands.groups) do
        for _, entry in ipairs(group.order) do
            check.truthy(commands.get(entry[2]))
            check.equal(group.commands[entry[1]], entry[2])
        end
    end
    check.truthy(handlers.assert_complete())
end }

return tests
