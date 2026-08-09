-- Preserves authored Unicode text so the formatter can resolve resident printer glyphs at compile time.
-- Only a leading UTF-8 byte-order mark is removed; malformed UTF-8 is reported instead of rewritten.
local Utf8 = require("tm_u220.charset.utf8")

local M = {}
local BOM = "\239\187\191"
local EMPTY = { "\194\173", "\226\128\139", "\226\129\160" }

function M.is_valid_utf8(value)
    return Utf8.decode(value) ~= nil
end

local function normalize(value, strip_bom)
    if type(value) ~= "string" then
        return nil, nil, {
            code = "CHARSET_INVALID_INPUT",
            message = "document text must be a string",
        }
    end

    local summary = { normalized = 0, substituted = 0, bom = 0, total = 0 }
    if strip_bom and value:sub(1, #BOM) == BOM then
        value = value:sub(#BOM + 1)
        summary.bom = 1
    end
    local _, failure = Utf8.decode(value)
    if failure then return nil, summary, failure end
    return value, summary
end

function M.normalize(value)
    return normalize(value, true)
end

function M.normalize_fragment(value)
    return normalize(value, false)
end

function M.empty_sequence_length(value, index)
    for _, needle in ipairs(EMPTY) do
        if value:sub(index, index + #needle - 1) == needle then
            return #needle
        end
    end
end

return M
