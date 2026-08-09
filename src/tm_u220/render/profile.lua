local M = {}

function M.queries(values)
    local out = { "TM-U220 bidirectional settings queries", "" }
    for _, query in ipairs(values) do
        out[#out + 1] = string.format("%-22s  %s", query.id, query.request_hex)
    end
    out[#out + 1] = ""
    out[#out + 1] = "Send one query and receive its response before sending the next."
    return table.concat(out, "\n") .. "\n"
end

function M.fact(value)
    local keys = {}
    for key, item in pairs(value) do
        if type(item) ~= "table" then keys[#keys + 1] = key end
    end
    table.sort(keys)
    local out = {}
    for _, key in ipairs(keys) do
        out[#out + 1] = string.format("%-28s %s", key .. ":", tostring(value[key]))
    end
    return table.concat(out, "\n") .. "\n"
end

return M
