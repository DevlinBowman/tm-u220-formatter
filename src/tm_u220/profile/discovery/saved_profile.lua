local ExplicitProfile = require("tm_u220.profile.discovery.explicit_profile")

local M = { new = ExplicitProfile.new }

local SCHEMA = ExplicitProfile.schema
local VERSION = ExplicitProfile.version

local function clone(value)
    if type(value) ~= "table" then return value end
    local result = {}
    for key, item in pairs(value) do result[clone(key)] = clone(item) end
    return result
end

local function failure(code, message, query_id)
    return nil, {
        severity = "error", code = code, message = message, query_id = query_id,
    }
end

local function assign(profile, key, value, fact)
    if profile[key] ~= nil and profile[key] ~= value then
        return failure("DISCOVERY_FACT_CONFLICT",
            "discovered " .. key .. " conflicts with the saved profile", fact.query_id)
    end
    profile[key] = value
    return true
end

local function apply_model_id(profile, fact)
    local ok, err = assign(profile, "printer_model_id", fact.printer_model_id, fact)
    if not ok then return nil, err end
    profile.model_candidates = profile.model_name and { profile.model_name }
        or clone(fact.model_candidates)
    return true
end

local function apply_model_name(profile, fact)
    local ok, err = assign(profile, "model_id", fact.model_id, fact)
    if not ok then return nil, err end
    ok, err = assign(profile, "model_name", fact.model_name, fact)
    if not ok then return nil, err end
    profile.model_candidates = { fact.model_name }
    profile.unresolved.model = nil
    return true
end

local function type_compatible(profile, autocutter, fact)
    local variant = profile.variant
    if variant and ((variant == "d") == autocutter) then
        return failure("DISCOVERY_FACT_CONFLICT",
            "autocutter result conflicts with explicit printer variant", fact.query_id)
    end
    local cutter = profile.cutter
    if cutter and ((cutter == "none") == autocutter) then
        return failure("DISCOVERY_FACT_CONFLICT",
            "autocutter result conflicts with explicit cutter setting", fact.query_id)
    end
    return true
end

local function apply_type_id(profile, fact)
    local ok, err = type_compatible(profile, fact.autocutter_installed, fact)
    if not ok then return nil, err end
    for key, value in pairs({
        type_id = fact.type_id,
        autocutter = fact.autocutter_installed,
        multi_byte_code_supported = fact.multi_byte_code_supported,
        type_id_reserved_bits = fact.reserved_bits,
    }) do
        ok, err = assign(profile, key, value, fact)
        if not ok then return nil, err end
    end
    profile.unresolved.autocutter = nil
    if profile.variant then
        profile.variant_candidates = { profile.variant }
    elseif fact.autocutter_installed then
        profile.variant_candidates = { "a", "b" }
    else
        profile.variant = "d"
        profile.variant_candidates = { "d" }
        profile.unresolved.variant = nil
    end
    return true
end

local function apply_language(profile, fact)
    if not fact.reported then return true end
    for key, value in pairs({
        language = fact.language,
        language_font = fact.language_font,
        language_font_name = fact.language_font_name,
        character_set = fact.character_set,
    }) do
        if value ~= nil then
            local ok, err = assign(profile, key, value, fact)
            if not ok then return nil, err end
        end
    end
    profile.unresolved.language = nil
    return true
end

local handlers = {
    model_id = apply_model_id,
    model_name = apply_model_name,
    type_id = apply_type_id,
    language = apply_language,
}

function M.apply(profile, fact)
    if type(profile) ~= "table" or profile.schema ~= SCHEMA or profile.version ~= VERSION then
        return failure("DISCOVERY_INVALID_SAVED_PROFILE", "saved profile schema is not supported")
    end
    if type(fact) ~= "table" or not handlers[fact.kind] or type(fact.query_id) ~= "string" then
        return failure("DISCOVERY_INVALID_FACT", "decoded discovery fact is not supported")
    end

    local result = clone(profile)
    local prior = result.evidence[fact.query_id]
    if prior and prior.response_hex ~= fact.response_hex then
        return failure("DISCOVERY_FACT_CONFLICT",
            "query has already been saved with a different response", fact.query_id)
    end
    local ok, err = handlers[fact.kind](result, fact)
    if not ok then return nil, err end
    result.evidence[fact.query_id] = {
        kind = fact.kind, response_hex = fact.response_hex,
    }
    return result
end

function M.apply_all(profile, facts)
    local result = profile
    for _, fact in ipairs(facts or {}) do
        local next_profile, err = M.apply(result, fact)
        if not next_profile then return nil, err end
        result = next_profile
    end
    return result
end

function M.to_compiler_options(profile)
    if type(profile) ~= "table" or profile.schema ~= SCHEMA or profile.version ~= VERSION then
        return failure("DISCOVERY_INVALID_SAVED_PROFILE", "saved profile schema is not supported")
    end

    local required = { "variant", "paper", "dip2_1", "cutter" }
    local unresolved = {}
    for _, field in ipairs(required) do
        if profile[field] == nil then unresolved[#unresolved + 1] = field end
    end
    if #unresolved > 0 then
        local _, diagnostic = failure("DISCOVERY_PROFILE_UNRESOLVED",
            "compiler profile requires resolved settings: " .. table.concat(unresolved, ", "))
        diagnostic.unresolved_fields = unresolved
        return nil, diagnostic
    end

    local validated, err = ExplicitProfile.new({
        variant = profile.variant,
        paper = profile.paper,
        dip2_1 = profile.dip2_1,
        cutter = profile.cutter,
    })
    if not validated then return nil, err end
    return {
        variant = validated.variant,
        paper = validated.paper,
        dip2_1 = validated.dip2_1,
        cutter = validated.cutter,
    }
end

return M
