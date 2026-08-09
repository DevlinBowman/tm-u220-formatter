-- Exercises native job operations through layout and ESC/POS node compilation.
local check = require("unit.support")
local compiler = require("tm_u220.app.job_compiler")
local job = require("tm_u220.job.init")
local job_service = require("tm_u220.app.job_service")
local encoder = require("tm_u220.escpos.encoder")
local preview = require("tm_u220.render.preview")

local tests = {}

local function profile(values)
    local result = {
        variant = "B", paper = 76, dip2_1 = false, cutter = "partial",
    }
    for key, value in pairs(values or {}) do result[key] = value end
    return result
end

local function document(operations)
    return { version = 1, profile = {}, ops = operations, diagnostics = {} }
end

local function compile_ops(operations, selected_profile)
    return compiler.compile(document(operations), {
        profile = selected_profile or profile(),
    })
end

local function count_command(nodes, id)
    local count = 0
    for _, node in ipairs(nodes or {}) do
        if node.kind == "command" and node.id == id then count = count + 1 end
    end
    return count
end

local function has_diagnostic(result, code)
    for _, item in ipairs(result.diagnostics or {}) do
        if item.code == code then return item end
    end
end

tests[#tests + 1] = { "compiler emits one implicit ESC @ before job content", function()
    local result = compile_ops({ { kind = "text_line", text = "OK" } })
    check.equal(#result.diagnostics, 0)
    check.equal(result.nodes[1].kind, "command")
    check.equal(result.nodes[1].id, "control.initialize")
    check.equal(count_command(result.nodes, "control.initialize"), 1)
    local encoded = encoder.encode(result.nodes)
    check.truthy(encoded.bytes)
    check.equal(encoded.bytes:sub(1, 2), check.bytes("1B 40"))
end }

tests[#tests + 1] = { "official A and B columns wrap exactly across paper profiles", function()
    local cases = {
        { 76, false, 33, 40 }, { 76, true, 35, 42 },
        { 69.5, false, 30, 36 }, { 69.5, true, 32, 40 },
        { 57.5, false, 25, 30 }, { 57.5, true, 27, 33 },
    }
    for _, case in ipairs(cases) do
        for _, font in ipairs({ "a", "b" }) do
            local capacity = font == "a" and case[3] or case[4]
            local operations = {}
            if font == "a" then
                operations[#operations + 1] = { kind = "font", value = "a" }
            end
            operations[#operations + 1] = {
                kind = "text_line", text = ("X"):rep(capacity + 1),
            }
            local result = compile_ops(operations, profile {
                paper = case[1], dip2_1 = case[2],
            })
            check.equal(#result.diagnostics, 0, "unexpected format diagnostic")
            check.equal(result.profile.columns[font], capacity, "profile column mismatch")
            check.equal(#result.preview_lines, 2, "expected one wrapped line")
            check.equal(#result.preview_lines[1].text, capacity, "wrong first-line width")
            check.equal(result.preview_lines[2].text, "X", "wrong wrapped remainder")
            check.equal(result.preview_lines[1].reason, "wrap")
            check.equal(result.preview_lines[2].reason, "text_line")
        end
    end
end }

tests[#tests + 1] = { "color and alignment are rejected away from line beginning", function()
    local parsed = job.parse(table.concat({
        "!tm-u220 job 1", "@text X", "@color red", "@align right", "@line",
    }, "\n"))
    local result = compiler.compile(parsed, { profile = profile() })
    check.equal(#result.diagnostics, 2)
    check.equal(result.diagnostics[1].code, "FORMAT_REQUIRES_LINE_BEGINNING")
    check.contains(result.diagnostics[1].message, "@color")
    check.equal(result.diagnostics[2].code, "FORMAT_REQUIRES_LINE_BEGINNING")
    check.contains(result.diagnostics[2].message, "@align")
    check.equal(count_command(result.nodes, "style.color"), 0)
    check.equal(count_command(result.nodes, "position.justification"), 0)
    check.equal(result.preview_lines[1].justification, "left")
    check.equal(result.preview_lines[1].segments[1].style.color, "black")
end }

tests[#tests + 1] = { "upside-down printing is line-bound and resettable", function()
    local parsed = job.parse(table.concat({
        "!tm-u220 job 1",
        "@upside-down on",
        "ROTATED",
        "@init",
        "NORMAL",
    }, "\n"))
    local result = compiler.compile(parsed, { profile = profile() })
    check.equal(#result.diagnostics, 0)
    check.equal(count_command(result.nodes, "style.upside_down"), 1)
    check.equal(count_command(result.nodes, "control.initialize"), 2)
    check.equal(result.preview_lines[1].segments[1].style.upside_down, true)
    check.equal(result.preview_lines[2].segments[1].style.upside_down, false)
    check.contains(preview.render(result), "[upside-down]")

    local misplaced = job.parse(table.concat({
        "!tm-u220 job 1", "@text X", "@upside-down on", "@line",
    }, "\n"))
    result = compiler.compile(misplaced, { profile = profile() })
    check.truthy(has_diagnostic(result, "FORMAT_REQUIRES_LINE_BEGINNING"))
    check.equal(count_command(result.nodes, "style.upside_down"), 0)
end }

tests[#tests + 1] = { "requested cut shape cannot override installed hardware shape", function()
    local mismatch = job.parse("!tm-u220 job 1\n@cut full")
    local result = compiler.compile(mismatch, { profile = profile { cutter = "partial" } })
    check.truthy(has_diagnostic(result, "FORMAT_CUT_SHAPE_MISMATCH"))
    check.equal(count_command(result.nodes, "mechanism.cut"), 0)

    local installed = job.parse("!tm-u220 job 1\n@cut installed")
    result = compiler.compile(installed, { profile = profile { cutter = "partial" } })
    check.equal(#result.diagnostics, 0)
    check.equal(count_command(result.nodes, "mechanism.cut"), 1)
    check.equal(result.nodes[2].args.mode, "function_b_66")
    check.equal(result.nodes[2].args.feed_units, 0)
    check.equal(result.finish.cut_shape, "partial")
    check.truthy(result.finish.advance_to_cut_position)
    check.equal(result.finish.feed_lines, 0)
    check.equal(result.finish.feed_units, 0)
    check.contains(preview.render(result),
        "Finish: advance to cutter position; partial cut")
end }

tests[#tests + 1] = { "every cut feeds to the cutting position with Function B", function()
    local cases = {
        { cutter = "partial", source = "@cut installed",
            mode = "function_b_66", feed = 0, bytes = "1D 56 42 00" },
        { cutter = "full", source = "@cut installed",
            mode = "function_b_65", feed = 0, bytes = "1D 56 41 00" },
        { cutter = "partial", source = "@cut partial feed=9",
            mode = "function_b_66", feed = 9, bytes = "1D 56 42 09" },
    }
    for _, case in ipairs(cases) do
        local parsed = job.parse("!tm-u220 job 1\n" .. case.source)
        local result = compiler.compile(parsed, {
            profile = profile { cutter = case.cutter },
        })
        check.equal(#result.diagnostics, 0)
        local cut = result.nodes[#result.nodes]
        check.equal(cut.id, "mechanism.cut")
        check.equal(cut.args.mode, case.mode)
        check.equal(cut.args.feed_units, case.feed)
        local encoded = encoder.encode({ cut })
        check.equal(encoded.bytes, check.bytes(case.bytes))
    end
end }

tests[#tests + 1] = { "@fi expands to four logical lines and installed cut", function()
    local parsed = job.parse(table.concat({
        "!tm-u220 job 1",
        "Tail",
        "@fi",
    }, "\n"))
    check.equal(#parsed.diagnostics, 0)
    check.equal(parsed.ops[2].kind, "finish")
    check.equal(parsed.ops[2].feed_lines, 4)

    local result = compiler.compile(parsed, { profile = profile() })
    check.equal(#result.diagnostics, 0)
    local feed = result.nodes[#result.nodes - 1]
    local cut = result.nodes[#result.nodes]
    check.equal(feed.id, "print.feed_lines")
    check.equal(feed.args.lines, 4)
    check.equal(cut.id, "mechanism.cut")
    check.equal(cut.args.mode, "function_b_66")
    check.equal(cut.args.feed_units, 0)
    check.equal(result.finish.feed_lines, 4)
    check.equal(result.finish.feed_units, 0)
    check.contains(preview.render(result),
        "Finish: feed 4 logical lines; advance to cutter position; partial cut")
end }

tests[#tests + 1] = { "@fi must be unique and final", function()
    local cases = {
        { "@fi\nTail", "FORMAT_FINISH_NOT_FINAL" },
        { "@fi\n@cut installed", "FORMAT_FINISH_NOT_FINAL" },
        { "@fi\n@fi", "FORMAT_FINISH_DUPLICATE" },
    }
    for _, case in ipairs(cases) do
        local parsed = job.parse("!tm-u220 job 1\n" .. case[1])
        local result = compiler.compile(parsed, { profile = profile() })
        check.truthy(has_diagnostic(result, case[2]), case[2])
    end
end }

tests[#tests + 1] = { "@fi rejects every argument", function()
    for _, arguments in ipairs({ "0", "4", "-1", "1.5", "feed=4" }) do
        local parsed = job.parse("!tm-u220 job 1\n@fi " .. arguments)
        check.truthy(has_diagnostic(parsed, "job.directive.invalid_arguments"))
    end
end }

tests[#tests + 1] = { "Unicode file text emits exact page bytes and restores page zero for ASCII", function()
    local path = os.tmpname()
    local file = assert(io.open(path, "wb"))
    file:write("!tm-u220 job 1\n@text ŁA\n")
    assert(file:close())
    local ok, result = pcall(job_service.compile, path, { profile = profile() })
    os.remove(path)
    if not ok then error(result) end
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text, "ŁA")
    check.equal(result.bytes, check.bytes(
        "1B 40 1B 74 12 9D 1B 74 00 41 0A"))
end }

tests[#tests + 1] = { "default-page block glyph prints as its direct resident byte", function()
    local result = job_service.compile_content("█", {
        text = true,
        profile = profile(),
    })
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].text, "█")
    check.equal(result.bytes, check.bytes("1B 40 DB 0A"))
end }

tests[#tests + 1] = { "extended-only lines restore page zero before their boundary", function()
    local result = job_service.compile_content("Ł", {
        text = true,
        profile = profile(),
    })
    check.equal(#result.diagnostics, 0)
    check.equal(result.bytes, check.bytes(
        "1B 40 1B 74 12 9D 1B 74 00 0A"))
end }

tests[#tests + 1] = { "Unicode wrapping counts glyph cells instead of UTF-8 bytes", function()
    local text = ("é"):rep(40) .. "Я"
    local result = job_service.compile_content(text, {
        text = true,
        profile = profile(),
    })
    check.equal(#result.diagnostics, 0)
    check.equal(#result.preview_lines, 2)
    check.equal(result.preview_lines[1].text, ("é"):rep(40))
    check.equal(result.preview_lines[1].content_width_half_dots, 400)
    check.equal(result.preview_lines[2].text, "Я")
    check.equal(result.bytes,
        check.bytes("1B 40") .. string.char(0x82):rep(40)
            .. check.bytes("0A 1B 74 11 9F 1B 74 00 0A"))
end }

tests[#tests + 1] = { "invalid control text still fails atomically", function()
    local result = job_service.compile_content("OK\1BAD", {
        text = true,
        profile = profile(),
    })
    check.equal(result.bytes, nil)
    check.truthy(has_diagnostic(result, "FORMAT_UNSUPPORTED_CHARACTER"))
end }

return tests
