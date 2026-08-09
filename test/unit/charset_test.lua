-- Verifies the redistributable standard code-page tables and deterministic Unicode-to-byte planning.
-- The same closed catalog supplies both automatic and explicit authoring lookups.
local check = require("unit.support")
local Encoder = require("tm_u220.charset.encoder")
local Pages = require("tm_u220.charset.pages")

local tests = {}

local function count_keys(values)
    local count = 0
    for _ in pairs(values) do count = count + 1 end
    return count
end

local function has_address(addresses, page, byte)
    for _, address in ipairs(addresses or {}) do
        if address.page == page and address.byte == byte then return true end
    end
    return false
end

tests[#tests + 1] = { "standard tables expose every public page mapping", function()
    local mappings = 0
    for _, page in pairs(Pages.pages) do mappings = mappings + count_keys(page) end
    check.equal(#Pages.definitions, 9)
    check.equal(mappings, 1242)
    check.equal(count_keys(Pages.all_unicode), 420)
    for byte = 0x20, 0x7E do
        check.equal(Pages.pages[0][byte], string.char(byte),
            string.format("missing printable Page 0 byte %02X", byte))
    end
    check.equal(Pages.pages[0][0xDB], "█")
    check.equal(Pages.pages[0][0xFF], "\u{00A0}")
    check.equal(Pages.pages[16][0x80], "€")
    check.equal(Pages.pages[16][0xA0], "\u{00A0}")
    check.equal(Pages.pages[17][0x81], "Б")
    check.equal(Pages.pages[18][0x9D], "Ł")
end }

tests[#tests + 1] = { "every standard mapping has its exact reverse address", function()
    local mappings = 0
    for _, page_id in ipairs(Pages.standard_pages) do
        for byte, character in pairs(Pages.pages[page_id]) do
            mappings = mappings + 1
            check.truthy(has_address(Pages.unicode[character], page_id, byte),
                string.format("missing reverse address %d:%02X", page_id, byte))
        end
    end
    check.equal(#Pages.standard_pages, 9)
    check.equal(mappings, 1242)
end }

tests[#tests + 1] = { "only declared standard pages enter the public catalog", function()
    check.falsy(Pages.has_page(9))
    check.falsy(Pages.has_page(255))
end }

tests[#tests + 1] = { "ASCII always resolves through default page zero", function()
    local address = Encoder.lookup("A", 18, 0)
    check.equal(address.page, 0)
    check.equal(address.byte, 0x41)

    local encoded = assert(Encoder.encode("ŁA", 0, 0))
    check.equal(encoded.tokens[1].page, 18)
    check.equal(encoded.tokens[1].byte, 0x9D)
    check.equal(encoded.tokens[2].page, 0)
    check.equal(encoded.tokens[2].byte, 0x41)
end }

tests[#tests + 1] = { "unsupported and malformed input fail visibly", function()
    local encoded = assert(Encoder.encode("🚗", 18, 0))
    check.equal(encoded.substituted, 1)
    check.equal(encoded.tokens[1].page, 0)
    check.equal(encoded.tokens[1].byte, 0x3F)

    local invalid, failure = Encoder.encode("\xC3", 0, 0)
    check.equal(invalid, nil)
    check.equal(failure.code, "CHARSET_INVALID_UTF8")
end }

return tests
