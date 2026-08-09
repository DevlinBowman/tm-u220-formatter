-- Resolves UTF-8 scalars to public standard-page bytes without owning ESC/POS switching.
-- Automatic text sends ASCII to the default page; an explicit page lock instead confines every glyph to that page.
local Catalog = require("tm_u220.charset.pages")
local Utf8 = require("tm_u220.charset.utf8")

local M = {}

local function scalar(value)
    local decoded = Utf8.decode(value)
    if decoded and #decoded == 1 then return decoded[1] end
end

function M.lookup(char, current_page, default_page, locked_page)
    local value = scalar(char)
    if not value then return nil end
    if locked_page ~= nil then
        return Catalog.lookup_in_page(value.char, locked_page)
    end
    return Catalog.lookup(value.char, current_page, default_page)
end

function M.encode(text, current_page, default_page, locked_page)
    default_page = default_page or 0
    if not Catalog.has_page(default_page) then
        return nil, {
            code = "CHARSET_UNSUPPORTED_PAGE",
            message = "unsupported default character page " .. tostring(default_page),
            page = default_page,
        }
    end
    if locked_page ~= nil and not Catalog.has_page(locked_page) then
        return nil, {
            code = "CHARSET_UNSUPPORTED_PAGE",
            message = "unsupported locked character page " .. tostring(locked_page),
            page = locked_page,
        }
    end

    local scalars, failure = Utf8.decode(text)
    if not scalars then return nil, failure end

    local tokens, substitutions = {}, {}
    local page = locked_page or (Catalog.has_page(current_page)
        and current_page or default_page)
    for index, value in ipairs(scalars) do
        local match = M.lookup(value.char, page, default_page, locked_page)
        local substituted = match == nil
        if substituted then
            match = { page = locked_page or default_page, byte = 0x3F }
            substitutions[#substitutions + 1] = {
                index = index,
                char = value.char,
                codepoint = value.codepoint,
            }
        end
        tokens[#tokens + 1] = {
            char = substituted and "?" or value.char,
            source_char = value.char,
            codepoint = value.codepoint,
            page = match.page,
            byte = match.byte,
            cells = 1,
            substituted = substituted,
        }
        page = locked_page or match.page
    end

    return {
        tokens = tokens,
        cells = #tokens,
        substitutions = substitutions,
        substituted = #substitutions,
        final_page = page,
    }
end

return M
