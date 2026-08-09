-- Verifies that JSON output preserves authored Unicode while making arbitrary printer bytes safe.
-- The inspection regression is covered through parsed extended-byte text nodes.
local check = require("unit.support")
local Json = require("tm_u220.core.json")
local Parser = require("tm_u220.escpos.parser")
local RenderJson = require("tm_u220.render.json")
local Utf8 = require("tm_u220.charset.utf8")

local tests = {}

tests[#tests + 1] = { "valid UTF-8 remains readable in JSON", function()
    local encoded = Json.encode({ text = "Café Я 日" })
    check.equal(encoded, '{"text":"Café Я 日"}')
    check.truthy(Utf8.decode(encoded))
end }

tests[#tests + 1] = { "malformed bytes become byte-specific Unicode escapes", function()
    local raw = string.char(0x9D, 0xC3) .. "x" .. string.char(0xFF)
    check.equal(Json.encode({ raw = raw }),
        '{"raw":"\\u009D\\u00C3x\\u00FF"}')
    check.equal(Json.encode({ [string.char(0xFF)] = "value" }),
        '{"\\u00FF":"value"}')
end }

tests[#tests + 1] = { "extended printer bytes keep inspect JSON valid", function()
    local parsed = Parser.parse(check.bytes(
        "1B 74 12 9D 1B 74 00 41"))
    local rendered = RenderJson.render(parsed)
    check.truthy(Utf8.decode(rendered))
    check.contains(rendered, '"raw":"\\u009D"')
    check.contains(rendered, '"value":"\\u009D"')
    check.contains(rendered, '"value":"A"')
end }

return tests
