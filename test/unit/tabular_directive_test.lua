-- Verifies table authoring is normalized without performing physical line allocation.
-- It also protects field pipes from the general source-line directive-chain grammar.
local check = require("unit.support")
local AliasFile = require("tm_u220.job.directive.alias_file")
local Directive = require("tm_u220.job.directive")
local job = require("tm_u220.job")
local tests = {}

local function parse_document(line)
    return job.parse("!tm-u220 job 1\n" .. line)
end

tests[#tests + 1] = { "table and columns normalize their three alignment layers", function()
    local span = { start_line = 2, end_line = 2 }
    local operation, failure = Directive.parse(
        "@table  r, 9,\t4lR, 3Cr, 8RL  ",
        span
    )
    check.falsy(failure)
    check.equal(operation.kind, "table_start")
    check.equal(operation.table_alignment, "R")
    check.equal(#operation.columns, 4)
    check.equal(operation.columns[1].width, 9)
    check.equal(operation.columns[1].content_alignment, "L")
    check.equal(operation.columns[1].group_alignment, "R")
    check.equal(operation.columns[2].width, 4)
    check.equal(operation.columns[2].content_alignment, "L")
    check.equal(operation.columns[2].group_alignment, "R")
    check.equal(operation.columns[3].content_alignment, "C")
    check.equal(operation.columns[3].group_alignment, "R")
    check.equal(operation.columns[4].content_alignment, "R")
    check.equal(operation.columns[4].group_alignment, "L")
    check.equal(operation.span, span)
end }

tests[#tests + 1] = { "plain numeric columns default every alignment to left", function()
    local operation, failure = Directive.parse("@table 9, 4, 4")
    check.falsy(failure)
    check.equal(operation.table_alignment, "L")
    check.equal(#operation.columns, 3)
    check.equal(operation.columns[1].content_alignment, "L")
    check.equal(operation.columns[1].group_alignment, "L")
    check.equal(operation.columns[2].content_alignment, "L")
    check.equal(operation.columns[2].group_alignment, "L")
    check.equal(operation.columns[3].content_alignment, "L")
    check.equal(operation.columns[3].group_alignment, "L")

    operation = Directive.parse("@table 32R,9LL")
    check.equal(operation.table_alignment, "L")
    check.equal(operation.columns[1].width, 32)
    check.equal(operation.columns[1].content_alignment, "R")
end }

tests[#tests + 1] = { "table schemas reject malformed or unsafe tokens", function()
    local cases = {
        "@table",
        "@table ",
        "@table L",
        "@table R",
        "@table C,9",
        "@table X,9",
        "@table 0L",
        "@table -1L",
        "@table 9X",
        "@table 9 L",
        "@table 0L,9LL",
        "@table 32R,0LL",
        "@table 32R,-1LL",
        "@table 32R,9XL",
        "@table 32R,9LC",
        "@table 9 L L",
        "@table 9LL,*",
        "@table 9LL gap=1",
        "@table 9LL,",
        "@table 9LL,,4RR",
        "@table 9LLL",
        "@table 9007199254740992LL",
    }
    for _, source in ipairs(cases) do
        local document = parse_document(source)
        check.equal(#document.ops, 0, source)
        check.equal(#document.diagnostics, 1, source)
        check.equal(document.diagnostics[1].code, "job.directive.invalid_arguments")
    end

    local oversized_integer = parse_document(
        "@table " .. ("9"):rep(300) .. "LL")
    check.equal(#oversized_integer.ops, 0)
    check.equal(oversized_integer.diagnostics[1].code,
        "job.directive.invalid_arguments")

    local largest_safe = parse_document("@table 9007199254740991LL")
    check.equal(#largest_safe.diagnostics, 0)
    check.equal(largest_safe.ops[1].columns[1].width, 9007199254740991)
end }

tests[#tests + 1] = { "table fields trim structure and retain explicit blanks", function()
    local operation, failure = Directive.parse(
        "@row 2x4x16 | RW |  |\t| $29.99 |"
    )
    check.falsy(failure)
    check.equal(operation.kind, "table_row")
    check.equal(#operation.fields, 6)
    check.equal(operation.fields[1], "2x4x16")
    check.equal(operation.fields[2], "RW")
    check.equal(operation.fields[3], "")
    check.equal(operation.fields[4], "")
    check.equal(operation.fields[5], "$29.99")
    check.equal(operation.fields[6], "")

    operation = Directive.parse("@head Board | Spcs | Pcs | Grd | Ea")
    check.equal(operation.kind, "table_head")
    check.equal(#operation.fields, 5)
    check.equal(operation.fields[1], "Board")
    check.equal(operation.fields[5], "Ea")
end }

tests[#tests + 1] = { "table fields decode escaped pipes and preserve internal text", function()
    local operation, failure = Directive.parse(
        "@row  Lumber  \\| treated | A  B | C\\D  "
    )
    check.falsy(failure)
    check.equal(#operation.fields, 3)
    check.equal(operation.fields[1], "Lumber  | treated")
    check.equal(operation.fields[2], "A  B")
    check.equal(operation.fields[3], "C\\D")
end }

tests[#tests + 1] = { "head and row own pipes instead of starting directive chains", function()
    local document = parse_document("@head Board | @font b | Ea")
    check.equal(#document.diagnostics, 0)
    check.equal(#document.ops, 1)
    check.equal(document.ops[1].kind, "table_head")
    check.equal(document.ops[1].fields[2], "@font b")

    document = parse_document("@row A \\| @font b | C")
    check.equal(#document.diagnostics, 0)
    check.equal(#document.ops, 1)
    check.equal(document.ops[1].fields[1], "A | @font b")
    check.equal(document.ops[1].fields[2], "C")
end }

tests[#tests + 1] = { "table directives cannot follow another directive in a chain", function()
    for _, source in ipairs({
        "@font a | @head Board | Ea",
        "@emphasis on | @row A | B",
        "@font a | @table 9LL",
        "@font a | @end-table",
    }) do
        local document = parse_document(source)
        check.equal(#document.ops, 0, source)
        check.equal(#document.diagnostics, 1, source)
        check.equal(document.diagnostics[1].code, "job.directive.invalid_syntax")
    end
end }

tests[#tests + 1] = { "end-table accepts only structural whitespace", function()
    local operation, failure = Directive.parse("@end-table \t")
    check.falsy(failure)
    check.equal(operation.kind, "table_end")

    local document = parse_document("@end-table now")
    check.equal(#document.ops, 0)
    check.equal(document.diagnostics[1].code, "job.directive.invalid_arguments")
end }

tests[#tests + 1] = { "table aliases retain source-line ownership", function()
    local configured = AliasFile.parse(table.concat({
        "!tm-u220 aliases 1",
        "@tr * == @row *",
        "@tb * == @table *",
    }, "\n"))
    check.equal(#configured.diagnostics, 0)

    local document = job.parse(
        "!tm-u220 job 1\n@tr A | @font b",
        { aliases = configured.entries }
    )
    check.equal(#document.diagnostics, 0)
    check.equal(#document.ops, 1)
    check.equal(document.ops[1].kind, "table_row")
    check.equal(document.ops[1].fields[2], "@font b")

    document = job.parse(
        "!tm-u220 job 1\n@emphasis on | @tr A | B",
        { aliases = configured.entries }
    )
    check.equal(#document.ops, 0)
    check.equal(document.diagnostics[1].code, "job.directive.invalid_syntax")

    document = job.parse(
        "!tm-u220 job 1\n@font a | @tb 9LL",
        { aliases = configured.entries }
    )
    check.equal(#document.ops, 0)
    check.equal(document.diagnostics[1].code, "job.directive.invalid_syntax")
end }

return tests
