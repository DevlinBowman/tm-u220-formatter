-- Loads redistributable standard page/byte-to-Unicode tables and builds deterministic reverse indexes.
-- Explicit locks remain limited to the same public catalog used by automatic lookup.
local Catalog = require("tm_u220.charset.catalog")
local DEFINITIONS = Catalog.definitions

local pages, names, families = {}, {}, {}
local standard_pages, unicode, standard_unicode = {}, {}, {}

local function add_address(index, character, page, byte)
    local addresses = index[character]
    if not addresses then
        addresses = {}
        index[character] = addresses
    end
    addresses[#addresses + 1] = { page = page, byte = byte }
end

for _, definition in ipairs(DEFINITIONS) do
    local path = "tm_u220.charset.pages." .. definition.module
    local bytes = require(path)
    pages[definition.id] = bytes
    names[definition.id] = definition.name
    families[definition.id] = "standard"
    standard_pages[#standard_pages + 1] = definition.id
    for byte = 0x20, 0xFF do
        local character = bytes[byte]
        if character then
            add_address(unicode, character, definition.id, byte)
            add_address(standard_unicode, character, definition.id, byte)
        end
    end
end

local M = {
    definitions = DEFINITIONS,
    pages = pages,
    names = names,
    families = families,
    standard_pages = standard_pages,
    unicode = unicode,
    all_unicode = unicode,
    standard_unicode = standard_unicode,
}

function M.has_page(page)
    return type(page) == "number" and page % 1 == 0 and pages[page] ~= nil
end

function M.lookup_in_page(character, page)
    if not M.has_page(page) or type(character) ~= "string"
        or character == "" then
        return nil
    end

    local addresses = unicode[character]
    local direct
    for _, address in ipairs(addresses or {}) do
        if address.page == page then
            -- A table-specific duplicate is the point of an explicit lock.
            if address.byte >= 0x80 then
                return { page = address.page, byte = address.byte }
            end
            direct = address
        end
    end
    if direct then return { page = direct.page, byte = direct.byte } end

    if #character == 1 then
        local byte = character:byte()
        if byte >= 0x20 and byte <= 0x7E then
            return { page = page, byte = byte }
        end
    end
end

function M.lookup(character, current_page, default_page)
    default_page = default_page or 0
    if type(character) ~= "string" or character == "" then return nil end
    if #character == 1 then
        local byte = character:byte()
        if byte >= 0x20 and byte <= 0x7E then
            return { page = default_page, byte = byte }
        end
    end

    local addresses = standard_unicode[character]
    if not addresses then return nil end
    for _, address in ipairs(addresses) do
        if address.page == current_page then
            return { page = address.page, byte = address.byte }
        end
    end
    local address = addresses[1]
    return { page = address.page, byte = address.byte }
end

for page, bytes in pairs(pages) do M[page] = bytes end
return M
