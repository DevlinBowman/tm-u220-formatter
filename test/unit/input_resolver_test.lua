-- Verifies safe file and inline resolution across raw and directive-aware inputs.
local check = require("unit.support")
local compiler = require("tm_u220.app.job_service")
local defaults = require("tm_u220.app.local_defaults")
local fs = require("tm_u220.core.fs")
local resolver = require("tm_u220.app.input_resolver")

local tests = {}

local function test(name, body)
    tests[#tests + 1] = { name, body }
end

local function temporary_path(suffix)
    local base = os.tmpname()
    os.remove(base)
    return base .. (suffix or "")
end

local function with_file(suffix, source, body)
    local path = temporary_path(suffix)
    local handle
    local ok, failure = xpcall(function()
        handle = assert(io.open(path, "wb"))
        assert(handle:write(source))
        assert(handle:close())
        handle = nil
        body(path)
    end, debug.traceback)
    if handle then pcall(handle.close, handle) end
    os.remove(path)
    if not ok then error(failure, 0) end
end

local function find_diagnostic(result, code)
    for _, item in ipairs(result.diagnostics or {}) do
        if item.code == code then return item end
    end
end

local function count_command(result, id)
    local count = 0
    for _, node in ipairs(result.nodes or {}) do
        if node.kind == "command" and node.id == id then count = count + 1 end
    end
    return count
end

local UTF8 = {
    bom = "\xEF\xBB\xBF",
    left_single = "\xE2\x80\x98",
    right_single = "\xE2\x80\x99",
    left_double = "\xE2\x80\x9C",
    right_double = "\xE2\x80\x9D",
    en_dash = "\xE2\x80\x93",
    em_dash = "\xE2\x80\x94",
    ellipsis = "\xE2\x80\xA6",
    nbsp = "\xC2\xA0",
    bullet = "\xE2\x80\xA2",
}

test("local printer profile resolves from the project root", function()
    local path = defaults.profile_path()
    check.contains(path, "/config/printers/local.u220p")
    local handle = assert(io.open(path, "r"))
    local source = handle:read("*a")
    handle:close()
    check.contains(source, "variant=B")
    check.contains(source, "paper=76")
    check.contains(source, "dip2_1=off")
    check.contains(source, "cutter=partial")
end)

test("literal text resolves to a compilable job using the local profile", function()
    local resolved = assert(resolver.resolve("hello printer"))
    check.equal(resolved.input_kind, "interpreted")
    check.equal(resolved.profile_path, defaults.profile_path())

    local result = compiler.compile_source(resolved.source, {
        profile_path = resolved.profile_path,
    })
    check.equal(#result.diagnostics, 0)
    check.equal(result.profile.id, "epson.tm_u220.b.76mm.dip_off")
    check.equal(result.preview_lines[1].text, "hello printer")
end)

test("plain text mode cannot inject directives comments or escapes", function()
    local result = compiler.compile_input(
        "@cut installed\n# hidden\n@@still text\n##also text",
        { text = true }
    )
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text, "@cut installed")
    check.equal(result.preview_lines[2].text, "# hidden")
    check.equal(result.preview_lines[3].text, "@@still text")
    check.equal(result.preview_lines[4].text, "##also text")
    check.equal(count_command(result, "mechanism.cut"), 0)
end)

test("multiline strict job source recognizes comments header and directives", function()
    local source = table.concat({
        "# first comment",
        "# second comment",
        "!tm-u220 job 1",
        "@align center",
        "@emphasis on",
        "Strict source",
        "@emphasis off",
    }, "\n")
    local result = compiler.compile_input(source)
    check.equal(#result.diagnostics, 0)
    check.truthy(result.bytes)
    check.equal(result.preview_lines[1].text, "Strict source")
    check.equal(result.preview_lines[1].justification, "center")
    check.equal(result.preview_lines[1].segments[1].style.emphasis, true)
    check.equal(count_command(result, "position.justification"), 1)
    check.equal(count_command(result, "style.emphasis"), 2)
end)

test("text mode keeps the same multiline job-shaped string literal", function()
    local source = table.concat({
        "# author comment",
        "!tm-u220 job 1",
        "@align center",
        "Strict source",
    }, "\n")
    local result = compiler.compile_input(source, { text = true })
    check.equal(#result.diagnostics, 0)
    check.truthy(result.bytes)
    check.equal(result.preview_lines[1].text, "# author comment")
    check.equal(result.preview_lines[2].text, "!tm-u220 job 1")
    check.equal(result.preview_lines[3].text, "@align center")
    check.equal(result.preview_lines[4].text, "Strict source")
    check.equal(result.preview_lines[4].justification, "left")
    check.equal(count_command(result, "position.justification"), 0)
end)

test("headerless input interprets comments directives and escaped hashes", function()
    local result = compiler.compile_input(
        "# [calc] hidden\n## Heading\n@cut installed\nBody")
    check.equal(#result.diagnostics, 0)
    check.truthy(result.bytes)
    check.equal(result.preview_lines[1].text, "# Heading")
    check.equal(result.preview_lines[2].text, "Body")
    check.equal(count_command(result, "mechanism.cut"), 1)
end)

test("plain text mode prints the job header itself", function()
    local result = compiler.compile_input("!tm-u220 job 1", { text = true })
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text, "!tm-u220 job 1")
end)

test("a readable u220 path remains a file input", function()
    with_file(".u220", "!tm-u220 job 1\n", function(path)
        local resolved, failure = resolver.resolve(path)
        check.falsy(failure)
        check.equal(resolved.input_kind, "interpreted")
        check.equal(resolved.path, path)
        check.equal(resolved.source, "!tm-u220 job 1\n")
    end)
end)

test("a readable ordinary document preserves comment and hash escape syntax", function()
    with_file(".txt", "# hidden\n## Heading\n@cut installed\nordinary text\n", function(path)
        local resolved, failure = resolver.resolve(path)
        check.falsy(failure)
        check.equal(resolved.input_kind, "interpreted")
        check.equal(resolved.path, path)
        check.equal(resolved.profile_path, defaults.profile_path())
        check.contains(resolved.source,
            "# hidden\n## Heading\n@cut installed\nordinary text")
    end)
end)

test("a readable JPEG is classified before binary bytes reach text validation", function()
    with_file(".jpg", "\255\216\255\224\0binary", function(path)
        local resolved, failure = resolver.resolve(path)
        check.falsy(failure)
        check.equal(resolved.input_kind, "image")
        check.equal(resolved.image_format, "jpeg")
        check.equal(resolved.path, path)
    end)
end)

test("an oversized sparse image is classified without a complete file read", function()
    local path = temporary_path(".jpg")
    local handle
    local ok, failure = xpcall(function()
        handle = assert(io.open(path, "wb"))
        assert(handle:write("\255\216\255\224signature"))
        assert(handle:seek("set", 16 * 1024 * 1024))
        assert(handle:write("\0"))
        assert(handle:close())
        handle = nil

        local resolved = assert(resolver.resolve(path, { fs = {
            read_prefix = fs.read_prefix,
            read = function()
                error("recognized direct images must not be read completely", 0)
            end,
        } }))
        check.equal(resolved.input_kind, "image")
        check.equal(resolved.image_format, "jpeg")
        local measured = assert(io.open(path, "rb"))
        check.truthy(assert(measured:seek("end")) > 1024 * 1024)
        assert(measured:close())
    end, debug.traceback)
    if handle then pcall(handle.close, handle) end
    os.remove(path)
    if not ok then error(failure, 0) end
end)

test("a missing u220-looking path fails instead of becoming text", function()
    local path = temporary_path(".u220")
    local resolved, failure = resolver.resolve(path)
    check.falsy(resolved)
    check.equal(failure.code, "INPUT_JOB_READ_FAILED")
    check.contains(failure.message, path)
end)

test("a missing ordinary-document path fails instead of becoming literal text", function()
    local path = temporary_path(".txt")
    local resolved, failure = resolver.resolve(path)
    check.falsy(resolved)
    check.equal(failure.code, "INPUT_FILE_READ_FAILED")
    check.contains(failure.message, path)
end)

test("a literal home-relative path explains standard shell expansion", function()
    local token = assert(temporary_path(".jpg"):match("([^/]+)$"))
    local path = "~/" .. token
    local resolved, failure = resolver.resolve(path)
    check.falsy(resolved)
    check.equal(failure.code, "INPUT_FILE_READ_FAILED")
    check.contains(failure.message,
        'use an unquoted ~ or "$HOME/..." for your home directory')
end)

test("missing whitespace-containing filenames fail instead of becoming text", function()
    local token = assert(temporary_path():match("([^/]+)$"))
    for _, case in ipairs({
        { "missing ordinary " .. token .. ".txt", "INPUT_FILE_READ_FAILED" },
        { "missing job " .. token .. ".u220", "INPUT_JOB_READ_FAILED" },
    }) do
        local resolved, failure = resolver.resolve(case[1])
        check.falsy(resolved)
        check.equal(failure.code, case[2])
        check.contains(failure.message, case[1])
    end
end)

test("u220-looking path detection is case insensitive", function()
    local path = temporary_path(".U220")
    local resolved, failure = resolver.resolve(path)
    check.falsy(resolved)
    check.equal(failure.code, "INPUT_JOB_READ_FAILED")
end)

test("explicit raw mode permits literal text ending in u220", function()
    local resolved = assert(resolver.resolve(
        "not-a-file.u220", { string_input = "raw" }))
    check.equal(resolved.input_kind, "plain")
    check.equal(resolved.source, "not-a-file.u220")
end)

test("explicit formatted mode interprets a path-shaped string", function()
    local resolved = assert(resolver.resolve(
        "not-a-file.u220", { string_input = "formatted" }))
    check.equal(resolved.input_kind, "interpreted")
    check.equal(resolved.path, nil)
    check.contains(resolved.source, "not-a-file.u220")

    local result = compiler.compile_input(
        "@emphasis on\nStyled", { string_input = "formatted" })
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text, "Styled")
    check.equal(result.preview_lines[1].segments[1].style.emphasis, true)
    check.equal(count_command(result, "style.emphasis"), 1)
end)

test("invalid explicit string type fails before path classification", function()
    local resolved, failure = resolver.resolve(
        "not-a-file.u220", { string_input = "unknown" })
    check.equal(resolved, nil)
    check.equal(failure.code, "INPUT_STRING_TYPE_INVALID")
end)

test("explicit string modes never resolve their values as files", function()
    local content = table.concat({
        "@cut installed",
        "# heading",
        "!tm-u220 job 1",
        "@emphasis on",
    }, "\n")
    with_file(".u220", content, function(path)
        local resolved = assert(resolver.resolve(path, { string_input = "raw" }))
        check.equal(resolved.input_kind, "plain")
        check.equal(resolved.path, nil)
        check.equal(resolved.source, path)

        local formatted = assert(resolver.resolve(
            path, { string_input = "formatted" }))
        check.equal(formatted.input_kind, "interpreted")
        check.equal(formatted.path, nil)
        check.contains(formatted.source, path)
        check.falsy(formatted.source:find(content, 1, true))
    end)
end)

test("formatted string compiles to the same bytes as identical file content", function()
    local source = "@emphasis on | @text Styled | @line"
    with_file(".u220", source, function(path)
        local from_file = compiler.compile_input(path)
        local from_string = compiler.compile_input(
            source, { string_input = "formatted" })
        check.equal(#from_file.diagnostics, 0)
        check.equal(#from_string.diagnostics, 0)
        check.equal(from_string.bytes, from_file.bytes)
    end)
end)

test("explicit text mode keeps an inline job-shaped value completely literal", function()
    local source = table.concat({
        "@cut installed",
        "# heading",
        "!tm-u220 job 1",
        "@emphasis on",
    }, "\n")
    local result = compiler.compile_input(source, { string_input = "raw" })
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text, "@cut installed")
    check.equal(result.preview_lines[2].text, "# heading")
    check.equal(result.preview_lines[3].text, "!tm-u220 job 1")
    check.equal(result.preview_lines[4].text, "@emphasis on")
    check.equal(count_command(result, "mechanism.cut"), 0)
    check.equal(count_command(result, "style.emphasis"), 0)
end)

test("plain and interpreted inputs preserve meaningful blank lines", function()
    local plain_empty = compiler.compile_input("", { text = true })
    check.equal(#plain_empty.diagnostics, 0)
    check.equal(count_command(plain_empty, "print.line_feed"), 0)

    local plain_lines = compiler.compile_input("\n\n", { text = true })
    check.equal(#plain_lines.diagnostics, 0)
    check.equal(#plain_lines.preview_lines, 2)

    local interpreted = compiler.compile_input("Body\n\n")
    check.equal(#interpreted.diagnostics, 0)
    check.equal(interpreted.preview_lines[1].text, "Body")
    check.equal(interpreted.preview_lines[2].text, "")
end)

test("ordinary documents compile with comments headings and active directives", function()
    with_file(".txt", "# hidden\n## Heading\n@cut installed\nBody\n", function(path)
        local result = compiler.compile_input(path)
        check.equal(#result.diagnostics, 0)
        check.equal(result.profile.id, "epson.tm_u220.b.76mm.dip_off")
        check.equal(result.preview_lines[1].text, "# Heading")
        check.equal(result.preview_lines[2].text, "Body")
        check.equal(count_command(result, "mechanism.cut"), 1)
    end)
end)

test("ordinary Unicode punctuation uses resident pages without transliteration", function()
    local content = table.concat({
        UTF8.bom .. UTF8.left_double .. "quoted" .. UTF8.right_double,
        UTF8.left_single .. "single" .. UTF8.right_single,
        "en" .. UTF8.en_dash .. "dash",
        "em" .. UTF8.em_dash .. "dash",
        "wait" .. UTF8.ellipsis,
        "non" .. UTF8.nbsp .. "breaking",
        UTF8.bullet .. " item",
    }, "\n")

    with_file(".txt", content, function(path)
        local result = compiler.compile_input(path)
        check.truthy(result.bytes, "Unicode document must compile")
        check.equal(result.preview_lines[1].text, "“quoted”")
        check.equal(result.preview_lines[2].text, "‘single’")
        check.equal(result.preview_lines[3].text, "en–dash")
        check.equal(result.preview_lines[4].text, "em—dash")
        check.equal(result.preview_lines[5].text, "wait…")
        check.equal(result.preview_lines[6].text, "non" .. UTF8.nbsp .. "breaking")
        check.equal(result.preview_lines[7].text, "• item")
        check.truthy(result.source:find(UTF8.left_double, 1, true))
        check.truthy(count_command(result, "style.code_table") > 0)

        check.falsy(find_diagnostic(result, "FORMAT_GLYPH_SUBSTITUTED"))
        check.falsy(find_diagnostic(result, "INPUT_TEXT_NORMALIZED"))
    end)
end)

test("literal Unicode punctuation uses the same resident-page encoding", function()
    local result = compiler.compile_input(
        UTF8.left_double .. "hello" .. UTF8.right_double
            .. UTF8.ellipsis .. UTF8.nbsp .. UTF8.bullet
    )
    check.truthy(result.bytes)
    check.equal(result.preview_lines[1].text,
        "“hello”…" .. UTF8.nbsp .. "•")
    check.falsy(find_diagnostic(result, "FORMAT_GLYPH_SUBSTITUTED"))
    check.truthy(count_command(result, "style.code_table") > 0)
end)

test("plain text mode uses resident-page Unicode encoding", function()
    local result = compiler.compile_input(
        UTF8.left_double .. "hello" .. UTF8.right_double
            .. UTF8.ellipsis .. UTF8.nbsp .. UTF8.bullet,
        { text = true }
    )
    check.truthy(result.bytes)
    check.equal(result.preview_lines[1].text,
        "“hello”…" .. UTF8.nbsp .. "•")
    check.falsy(find_diagnostic(result, "FORMAT_GLYPH_SUBSTITUTED"))
end)

test("unknown Unicode stays visible as a question mark with a warning", function()
    local result = compiler.compile_input("status \xF0\x9F\x9A\x97")
    check.truthy(result.bytes)
    check.equal(result.preview_lines[1].text, "status ?")
    local warning = find_diagnostic(result, "FORMAT_GLYPH_SUBSTITUTED")
    check.truthy(warning)
    check.contains(warning.message, "U+1F697")
end)

test("u220 files preserve and encode supported Unicode", function()
    local source = "!tm-u220 job 1\nstrict "
        .. UTF8.left_double .. "text" .. UTF8.right_double .. "\n"
    with_file(".u220", source, function(path)
        local result = compiler.compile_input(path)
        check.truthy(result.bytes)
        check.equal(result.preview_lines[1].text, "strict “text”")
        check.truthy(result.source:find(UTF8.left_double, 1, true))
        check.falsy(find_diagnostic(result, "FORMAT_UNSUPPORTED_CHARACTER"))
        check.falsy(find_diagnostic(result, "INPUT_TEXT_NORMALIZED"))
        check.truthy(count_command(result, "style.code_table") > 0)
    end)
end)

test("raw u220-shaped string also uses Unicode page encoding", function()
    local source = UTF8.left_double .. "plain" .. UTF8.right_double
    local result = compiler.compile_input(source, { string_input = "raw" })
    check.truthy(result.bytes)
    check.equal(result.preview_lines[1].text, "“plain”")
    check.falsy(find_diagnostic(result, "INPUT_TEXT_NORMALIZED"))
end)

test("file and quoted inputs share exact Unicode code-page bytes", function()
    local expected = check.bytes("1B 40 1B 74 12 9D 1B 74 00 41 0A")
    with_file(".txt", "ŁA", function(path)
        local from_file = compiler.compile_input(path)
        local from_string = compiler.compile_input("ŁA", { string_input = "raw" })
        check.equal(#from_file.diagnostics, 0)
        check.equal(#from_string.diagnostics, 0)
        check.equal(from_file.bytes, expected)
        check.equal(from_string.bytes, expected)
    end)
end)

test("malformed UTF-8 is rejected at the input boundary", function()
    local resolved, failure = resolver.resolve(
        "bad\xC3x", { string_input = "raw" })
    check.equal(resolved, nil)
    check.equal(failure.code, "INPUT_INVALID_UTF8")
    check.contains(failure.message, "invalid UTF-8")
end)

test("NUL input is rejected before any path handling", function()
    local resolved, failure = resolver.resolve("bad\0input.u220")
    check.falsy(resolved)
    check.equal(failure.code, "INPUT_INVALID")
end)

return tests
