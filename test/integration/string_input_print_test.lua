-- Proves file, formatted-string, and standard-input sources reach exact-byte printing.
local check = require("unit.support")
local PrintService = require("tm_u220.app.print_service")

local tests = {}

local function with_standard_input(source, body)
    local path = os.tmpname()
    local output = assert(io.open(path, "wb"))
    assert(output:write(source))
    assert(output:close())

    local previous = io.input()
    local input = assert(io.open(path, "rb"))
    local ok, failure = xpcall(function()
        io.input(input)
        body()
    end, debug.traceback)
    io.input(previous)
    input:close()
    os.remove(path)
    if not ok then error(failure, 0) end
end

tests[#tests + 1] = { "formatted strings submit the same bytes as files", function()
    local source = "@emphasis on | @text Styled | @line"
    local path = os.tmpname() .. ".u220"
    local file = assert(io.open(path, "wb"))
    assert(file:write(source))
    assert(file:close())

    local submitted = {}
    local transport = { submit = function(payload)
        submitted[#submitted + 1] = payload
        return { bytes_submitted = #payload, message = "accepted" }
    end }
    local called, failure = xpcall(function()
        local from_file = PrintService.print(path, {}, { transport = transport })
        local from_string = PrintService.print(source, {
            string_input = "formatted",
        }, { transport = transport })
        check.equal(#from_file.diagnostics, 0)
        check.equal(#from_string.diagnostics, 0)
        check.equal(from_string.compilation.bytes, from_file.compilation.bytes)
        check.equal(submitted[1], from_file.compilation.bytes)
        check.equal(submitted[2], submitted[1])
    end, debug.traceback)
    os.remove(path)
    if not called then error(failure, 0) end
end }

tests[#tests + 1] = { "piped source prints through EOF with its finish directive", function()
    with_standard_input("12345\n12345\n@fi", function()
        local submitted
        local transport = { submit = function(payload)
            submitted = payload
            return { bytes_submitted = #payload, message = "accepted" }
        end }
        local result = PrintService.print("-", {}, { transport = transport })

        check.equal(#result.diagnostics, 0)
        check.equal(#result.compilation.preview_lines, 2)
        check.equal(result.compilation.preview_lines[1].text, "12345")
        check.equal(result.compilation.preview_lines[2].text, "12345")
        check.equal(submitted, check.bytes(
            "1B 40 31 32 33 34 35 0A 31 32 33 34 35 0A "
                .. "1B 64 04 1D 56 42 00 1B 40"))
    end)
end }

return tests
