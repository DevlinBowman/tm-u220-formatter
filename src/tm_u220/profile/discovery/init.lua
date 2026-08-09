local Decoders = require("tm_u220.profile.discovery.decoders")
local Queries = require("tm_u220.profile.discovery.queries")
local SavedProfile = require("tm_u220.profile.discovery.saved_profile")

local M = {}

M.queries = Queries.list
M.query = Queries.get
M.decode = Decoders.decode
M.new_profile = SavedProfile.new
M.apply_fact = SavedProfile.apply
M.apply_facts = SavedProfile.apply_all
M.to_compiler_profile = SavedProfile.to_compiler_options

local function failure(code, message, query_id)
    return nil, {
        severity = "error", code = code, message = message, query_id = query_id,
    }
end

function M.merge_responses(responses, explicit)
    if type(responses) ~= "table" then
        return failure("DISCOVERY_INVALID_RESPONSES", "responses must be keyed by query ID")
    end
    for query_id in pairs(responses) do
        if not Queries.get(query_id) then
            return failure("DISCOVERY_UNKNOWN_QUERY", "unknown GS I discovery query", query_id)
        end
    end

    local profile, err = SavedProfile.new(explicit)
    if not profile then return nil, err end
    for _, query in ipairs(Queries.list()) do
        local response = responses[query.id]
        if response ~= nil then
            local fact
            fact, err = Decoders.decode(query.id, response)
            if not fact then return nil, err end
            profile, err = SavedProfile.apply(profile, fact)
            if not profile then return nil, err end
        end
    end
    return profile
end

return M
