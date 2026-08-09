local Bytes = require("tm_u220.core.bytes")
local Diagnostics = require("tm_u220.core.diagnostics")
local Json = require("tm_u220.core.json")

local M = {}

local function sorted_pairs_text(values)
    if type(values) ~= "table" or next(values) == nil then return "" end
    return Json.encode(values)
end

local function escaped(value)
    return value:gsub("[%c\\]", function(char)
        return string.format("\\x%02X", string.byte(char))
    end)
end

function M.render(parsed)
    local out = { "TM-U220 stream inspection", "" }

    for index, node in ipairs(parsed.nodes or {}) do
        local span = node.span or {}
        local where = span.first and string.format("%d-%d", span.first, span.last) or "?"
        if node.kind == "text" then
            out[#out + 1] = string.format(
                "%03d  bytes %-9s  TEXT  %q",
                index, where, escaped(node.value or "")
            )
        else
            out[#out + 1] = string.format(
                "%03d  bytes %-9s  %-28s  %s",
                index,
                where,
                node.id or node.kind or "unknown",
                sorted_pairs_text(node.args)
            )
        end
        if node.raw then
            out[#out + 1] = "     hex " .. Bytes.to_hex(node.raw)
        end
    end

    if #(parsed.diagnostics or {}) > 0 then
        out[#out + 1] = ""
        out[#out + 1] = "Diagnostics"
        for _, item in ipairs(parsed.diagnostics) do
            out[#out + 1] = "  " .. Diagnostics.format(item)
        end
    end

    return table.concat(out, "\n") .. "\n"
end

return M
