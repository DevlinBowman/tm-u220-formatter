local Framing = require("tm_u220.profile.discovery.framing")
local Queries = require("tm_u220.profile.discovery.queries")

local M = {}

local languages = {
    ["KANJI JAPANESE"] = { language = "japanese", font = "kanji_japanese" },
    ["CHINA GB2312"] = {
        language = "simplified_chinese", font = "china_gb2312", character_set = "GB2312",
    },
    ["CHINA GB18030"] = {
        language = "simplified_chinese", font = "china_gb18030", character_set = "GB18030",
    },
    ["TAIWAN BIG-5"] = {
        language = "traditional_chinese", font = "taiwan_big5", character_set = "BIG-5",
    },
    ["KOREA C-5601C"] = {
        language = "korean", font = "korea_c5601c", character_set = "C-5601C",
    },
    ["THAI 1 PASS"] = { language = "thai", font = "thai_1_pass" },
}

local function failure(query_id, code, message)
    return nil, { severity = "error", code = code, message = message, query_id = query_id }
end

local function is_set(value, mask)
    return value % (mask * 2) >= mask
end

local function response_hex(response)
    local bytes = {}
    for index = 1, #response do
        bytes[index] = string.format("%02X", string.byte(response, index))
    end
    return table.concat(bytes, " ")
end

local function finish(fact, query_id, response)
    fact.query_id = query_id
    fact.response_hex = response_hex(response)
    return fact
end

local function decode_model_id(response, query_id)
    local value, err = Framing.printer_id(response, query_id)
    if value == nil then return nil, err end
    if value ~= 0x0D then
        return failure(query_id, "DISCOVERY_NOT_TM_U220_FAMILY",
            string.format("expected TM-U220 family model ID 0x0D, received 0x%02X", value))
    end
    return finish({
        kind = "model_id",
        printer_model_id = value,
        model_candidates = { "TM-U220", "TM-U220II" },
    }, query_id, response)
end

local function decode_type_id(response, query_id)
    local value, err = Framing.printer_id(response, query_id)
    if value == nil then return nil, err end
    if is_set(value, 0x04) or is_set(value, 0x10)
        or is_set(value, 0x40) or is_set(value, 0x80) then
        return failure(query_id, "DISCOVERY_INVALID_TM_U220_TYPE_ID",
            string.format("TM-U220 type ID has invalid fixed bits: 0x%02X", value))
    end

    local autocutter = is_set(value, 0x02)
    local reserved = (is_set(value, 0x08) and 0x08 or 0)
        + (is_set(value, 0x20) and 0x20 or 0)
    return finish({
        kind = "type_id",
        type_id = value,
        multi_byte_code_supported = is_set(value, 0x01),
        autocutter_installed = autocutter,
        variant_candidates = autocutter and { "a", "b" } or { "d" },
        reserved_bits = reserved,
    }, query_id, response)
end

local function decode_model_name(response, query_id)
    local value, err = Framing.information_b(response, query_id)
    if not value then return nil, err end
    if value ~= "TM-U220" then
        return failure(query_id, "DISCOVERY_UNSUPPORTED_MODEL",
            "expected exact model name TM-U220, received " .. (value == "" and "an empty value" or value))
    end
    return finish({
        kind = "model_name", model_id = "epson.tm_u220", model_name = value,
    }, query_id, response)
end

local function decode_language(response, query_id)
    local value, err = Framing.information_b(response, query_id)
    if value == nil then return nil, err end
    if value == "" then
        return finish({ kind = "language", reported = false }, query_id, response)
    end

    local known = languages[value]
    if not known then
        return failure(query_id, "DISCOVERY_UNSUPPORTED_LANGUAGE_RESPONSE",
            "unrecognized TM-U220 language-font value: " .. value)
    end
    return finish({
        kind = "language",
        reported = true,
        language = known.language,
        language_font = known.font,
        character_set = known.character_set,
        language_font_name = value,
    }, query_id, response)
end

local handlers = {
    ["gs_i.model_id"] = decode_model_id,
    ["gs_i.type_id"] = decode_type_id,
    ["gs_i.model_name"] = decode_model_name,
    ["gs_i.language_font"] = decode_language,
}

function M.decode(query_id, response)
    if not Queries.get(query_id) or not handlers[query_id] then
        return failure(query_id, "DISCOVERY_UNKNOWN_QUERY", "unknown GS I discovery query")
    end
    return handlers[query_id](response, query_id)
end

return M
