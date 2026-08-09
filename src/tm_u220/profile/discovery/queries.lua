local M = {}

local SOURCE = "https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_ci.html"
local PREFIX = { 0x1D, 0x49 }

local definitions = {
    {
        id = "gs_i.model_id",
        parameter = 1,
        response_kind = "printer_id",
        fact_kind = "model_id",
    },
    {
        id = "gs_i.type_id",
        parameter = 2,
        response_kind = "printer_id",
        fact_kind = "type_id",
    },
    {
        id = "gs_i.model_name",
        parameter = 67,
        response_kind = "information_b",
        fact_kind = "model_name",
    },
    {
        id = "gs_i.language_font",
        parameter = 69,
        response_kind = "information_b",
        fact_kind = "language",
    },
}

local function copy(definition)
    local bytes = { PREFIX[1], PREFIX[2], definition.parameter }
    return {
        id = definition.id,
        command = "GS I",
        parameter = definition.parameter,
        request = string.char(bytes[1], bytes[2], bytes[3]),
        request_bytes = bytes,
        request_hex = string.format("%02X %02X %02X", bytes[1], bytes[2], bytes[3]),
        response_kind = definition.response_kind,
        fact_kind = definition.fact_kind,
        source = SOURCE,
    }
end

function M.list()
    local result = {}
    for index, definition in ipairs(definitions) do
        result[index] = copy(definition)
    end
    return result
end

function M.get(id)
    for _, definition in ipairs(definitions) do
        if definition.id == id then
            return copy(definition)
        end
    end
    return nil
end

return M
