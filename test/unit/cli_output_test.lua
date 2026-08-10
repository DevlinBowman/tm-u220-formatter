-- Verifies top-level CLI failures stay concise while successful help stays complete.
local check = require("unit.support")
local help = require("tm_u220.cli.help")
local run = require("tm_u220.cli.run")
local version = require("tm_u220.version")

local tests = {}

local function capture(argv, terminal)
    local stdout, stderr = {}, {}
    terminal = terminal or {}
    terminal.write = function(...)
        for index = 1, select("#", ...) do
            stdout[#stdout + 1] = tostring(select(index, ...))
        end
    end
    terminal.write_error = function(...)
        for index = 1, select("#", ...) do
            stderr[#stderr + 1] = tostring(select(index, ...))
        end
    end
    local status = run.main(argv, terminal)
    return status, table.concat(stdout), table.concat(stderr)
end

tests[#tests + 1] = { "usage failures stay concise and point to explicit help", function()
    local cases = {
        { { "definitely-not-a-command" },
            "unknown command: definitely-not-a-command" },
        { { "preview" }, "preview expects 1 argument" },
        { { "image-profile" }, "image-profile expects 1 argument" },
        { { "edit", "receipt.u220" }, "unknown command: edit" },
        { { "check", "hello", "--bogus" }, "unknown option: --bogus" },
    }
    for _, case in ipairs(cases) do
        local status, stdout, stderr = capture(case[1])
        check.equal(status, 2)
        check.equal(stdout, "")
        check.equal(stderr, string.format(
            "220: %s; run '220 help' for usage\n", case[2]))
        check.falsy(stderr:find("Everyday use:", 1, true))
    end
end }

tests[#tests + 1] = { "bare invocation and overview help remain successful", function()
    for _, argv in ipairs({
        {}, { "help" }, { "--help" }, { "-h" },
    }) do
        local status, stdout, stderr = capture(argv)
        check.equal(status, 0)
        check.equal(stdout, help.text)
        check.equal(stderr, "")
    end
end }

tests[#tests + 1] = { "focused help is equivalent across supported spellings", function()
    local cases = {
        { { "help", "print" }, { "print", "--help" }, "print" },
        { { "help", "image-profile" },
            { "image-profile", "--help" }, "image-profile" },
        { { "help", "printer" }, { "printer", "-h" }, "printer" },
        { { "help", "printer", "setup" },
            { "printer", "setup", "--help" }, "printer setup" },
        { { "help", "dev" }, { "dev", "-h" }, "dev" },
        { { "help", "dev", "glyphs" },
            { "dev", "glyphs", "--help" }, "dev glyphs" },
    }
    for _, case in ipairs(cases) do
        local expected = assert(help.render(case[3]))
        for index = 1, 2 do
            local status, stdout, stderr = capture(case[index])
            check.equal(status, 0)
            check.equal(stdout, expected)
            check.equal(stderr, "")
        end
    end
    local compile = assert(help.render("compile"))
    check.contains(compile, "-o FILE, --output FILE")
    check.contains(compile, "--ftext FTEXT, --formatted-text FTEXT")
    check.contains(help.text, "220 help [command-path]")
    check.contains(help.text, "220 help printer setup")
    check.contains(help.text, "220 preview receipt.u220")
    check.contains(help.text, "220 render receipt.u220")
    check.contains(help.text, "220 directives")
    check.contains(help.text, "220 config")
    check.contains(help.text, "image-profile")
    check.contains(help.text, "220 dev glyphs")
    check.falsy(help.text:find("220 edit", 1, true))

    local config = assert(help.render("config"))
    check.contains(config, "Open editable authoring configuration")
    check.contains(config, "three tabs")
    check.contains(config, "user-owned copies")
    local image_profile = assert(help.render("image-profile"))
    check.contains(image_profile, "Usage:\n  220 image-profile <image>")
    check.contains(image_profile, "live printer-dot editor")
    check.contains(image_profile, "never print or contact the printer")
    local directives = assert(help.render("directives"))
    check.contains(directives, "220 rules directives")

    local developer = assert(help.render("dev"))
    check.contains(developer, "220 dev - Checkout-only developer commands")
    check.contains(developer, "glyphs")
    check.falsy(developer:find("Legacy flat spellings", 1, true))
    local glyphs = assert(help.render("dev glyphs"))
    check.contains(glyphs, "220 dev glyphs - Open the checkout-only glyph editor")
    check.contains(glyphs, "Usage:\n  220 dev glyphs")
    check.contains(glyphs, "available only from a source checkout")
end }

tests[#tests + 1] = { "developer leaf has no flat help spelling", function()
    for _, topic in ipairs({ "glyphs", "dev-glyphs" }) do
        local rendered, err = help.render(topic)
        check.equal(rendered, nil)
        check.contains(err, "unknown help topic")
    end
end }

tests[#tests + 1] = { "unknown focused help uses the standard usage envelope", function()
    local status, stdout, stderr = capture({ "help", "missing" })
    check.equal(status, 2)
    check.equal(stdout, "")
    check.equal(stderr,
        "220: unknown help topic \"missing\"; run '220 help' for usage\n")
end }

tests[#tests + 1] = { "version is available as a command and global option", function()
    for _, argv in ipairs({ { "version" }, { "--version" } }) do
        local status, stdout, stderr = capture(argv)
        check.equal(status, 0)
        check.equal(stdout, "220 " .. version.value .. "\n")
        check.equal(stderr, "")
    end
end }

tests[#tests + 1] = { "terminal hazards fail before command I/O", function()
    local status, stdout, stderr = capture({ "check" }, { stdin_is_tty = true })
    check.equal(status, 2)
    check.equal(stdout, "")
    check.contains(stderr, "input required when standard input is a terminal")

    status, stdout, stderr = capture({ "compile", "missing.u220" },
        { stdout_is_tty = true })
    check.equal(status, 2)
    check.equal(stdout, "")
    check.contains(stderr, "compile binary output requires --hex or -o FILE")

    status = capture({ "compile", "missing.u220", "-o", "-" },
        { stdout_is_tty = true })
    check.equal(status, 2)
end }

tests[#tests + 1] = { "fs-backed handlers honor injected output streams", function()
    local cases = {
        { { "check", "--text", "hello" }, "ok:" },
        { { "compile", "--text", "hello", "--hex" }, "68 65 6C 6C 6F" },
        { { "render", "--text", "hello" }, "hello" },
        { { "directives" }, "@table [TABLE_ALIGN,]COLUMN" },
        { { "profile-queries", "--json" }, "gs_i.model_id" },
    }
    for _, case in ipairs(cases) do
        local status, stdout, stderr = capture(case[1])
        check.equal(status, 0)
        check.contains(stdout, case[2])
        check.equal(stderr, "")
    end

    local status, stdout, stderr = capture({ "inspect", "ignored", "--json" }, {
        inspect_service = { inspect = function()
            return { diagnostics = {}, nodes = {} }
        end },
    })
    check.equal(status, 0)
    check.contains(stdout, '"nodes":[]')
    check.equal(stderr, "")
end }

tests[#tests + 1] = { "binary and named outputs preserve explicit routing", function()
    local status, stdout, stderr = capture({ "compile", "--text", "A", "-o", "-" },
        { stdout_is_tty = false })
    check.equal(status, 0)
    check.truthy(#stdout > 1)
    check.equal(stderr, "")

    local path = os.tmpname()
    status, stdout, stderr = capture({
        "compile", "--text", "A", "--hex", "-o", path,
    })
    local handle = assert(io.open(path, "r"))
    local saved = handle:read("*a")
    handle:close()
    os.remove(path)
    check.equal(status, 0)
    check.equal(stdout, "")
    check.contains(saved, "41")
    check.equal(stderr, "")
end }

tests[#tests + 1] = { "handler errors use injected stderr and canonical usage guidance", function()
    local status, stdout, stderr = capture({ "check", "definitely-missing.u220" })
    check.equal(status, 1)
    check.equal(stdout, "")
    check.contains(stderr, "INPUT_JOB_READ_FAILED")
    check.equal(stderr:sub(-1), "\n")

    status, stdout, stderr = capture({
        "profile-decode", "gs_i.not-real", "definitely-missing-response.hex",
    })
    check.equal(status, 2)
    check.equal(stdout, "")
    check.contains(stderr, "gs_i.not-real")
    check.contains(stderr, "220 profile-queries")
    check.contains(stderr, "run '220 help' for usage")

    status, stdout, stderr = capture({ "rules", "definitely-unknown" })
    check.equal(status, 2)
    check.equal(stdout, "")
    check.contains(stderr, "unknown rules topic")
    check.contains(stderr, "run '220 help' for usage")
end }

return tests
