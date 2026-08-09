-- Verifies @image has a strict, line-owning grammar independent of filesystem access.
-- Paths and optional character-cell boxes remain normalized parser data.
local check = require("unit.support")
local job = require("tm_u220.job")

local tests = {}

local function parse(line)
    return job.parse("!tm-u220 job 1\n" .. line)
end

local function has_code(document, code)
    for _, item in ipairs(document.diagnostics or {}) do
        if item.code == code then return true end
    end
end

tests[#tests + 1] = { "image paths and optional boxes parse exactly", function()
    local document = parse('@image "art/smiley face.pbm" 20 10')
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].kind, "image")
    check.equal(document.ops[1].path, "art/smiley face.pbm")
    check.equal(document.ops[1].width_cells, 20)
    check.equal(document.ops[1].height_cells, 10)

    document = parse('@image "art/\\\"face\\\".pbm" page auto')
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].path, 'art/"face".pbm')
    check.equal(document.ops[1].width_cells, "page")
    check.equal(document.ops[1].height_cells, "auto")

    document = parse("@image art/logo.pbm")
    check.equal(#document.diagnostics, 0)
    check.equal(document.ops[1].width_cells, nil)
end }

tests[#tests + 1] = { "image grammar rejects malformed boxes and quoting", function()
    for _, source in ipairs({
        "@image", '@image "unterminated.pbm', '@image "bad\\q.pbm"',
        "@image art.pbm 20", "@image art.pbm 0 10",
        "@image art.pbm 20 256", "@image art.pbm wide auto",
    }) do
        check.truthy(has_code(parse(source), "job.directive.invalid_arguments"), source)
    end
end }

tests[#tests + 1] = { "image owns its complete source line", function()
    local document = parse("@image art.pbm | @font a")
    check.truthy(has_code(document, "job.directive.invalid_arguments"))

    document = parse("@font a | @image art.pbm")
    check.truthy(has_code(document, "job.directive.invalid_syntax"))
end }

return tests
