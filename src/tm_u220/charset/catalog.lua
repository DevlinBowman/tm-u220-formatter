-- Declares the exact standard character-page catalog supported by the formatter.
-- Shared indexes keep text lookup and low-level ESC t validation on the same closed set.
local definitions = {
    { id = 0, name = "PC437", module = "page_00_pc437" },
    { id = 2, name = "PC850", module = "page_02_pc850" },
    { id = 3, name = "PC860", module = "page_03_pc860" },
    { id = 4, name = "PC863", module = "page_04_pc863" },
    { id = 5, name = "PC865", module = "page_05_pc865" },
    { id = 16, name = "WPC1252", module = "page_16_wpc1252" },
    { id = 17, name = "PC866", module = "page_17_pc866" },
    { id = 18, name = "PC852", module = "page_18_pc852" },
    { id = 19, name = "PC858", module = "page_19_pc858" },
}

local ids, by_id, enum_encode, enum_decode = {}, {}, {}, {}
for _, definition in ipairs(definitions) do
    ids[#ids + 1] = definition.id
    by_id[definition.id] = definition
    enum_encode[definition.id] = definition.id
    enum_decode[definition.id] = definition.id
end

return {
    definitions = definitions,
    ids = ids,
    by_id = by_id,
    enum_encode = enum_encode,
    enum_decode = enum_decode,
}
