local M = {}

M.schema = "tm_u220.discovery_profile"
M.version = 1

local paper_aliases = {
    [76] = "76mm", [69.5] = "69.5mm", [57.5] = "57.5mm",
    ["76"] = "76mm", ["69.5"] = "69.5mm", ["57.5"] = "57.5mm",
    ["76mm"] = "76mm", ["69.5mm"] = "69.5mm", ["57.5mm"] = "57.5mm",
}

local function failure(message)
    return nil, {
        severity = "error",
        code = "DISCOVERY_INVALID_EXPLICIT_PROFILE",
        message = message,
    }
end

local function base_profile()
    return {
        schema = M.schema,
        version = M.version,
        variant_candidates = { "a", "b", "d" },
        evidence = {},
        unresolved = {
            model = "awaiting exact GS I model-name response",
            autocutter = "awaiting GS I type-ID response",
            language = "awaiting a recognized GS I language-font response",
            variant = "GS I cannot distinguish Type A from Type B",
            paper = "paper width is not exposed by supported TM-U220 GS I queries",
            dip2_1 = "DIP switch 2-1 spacing is not exposed by supported TM-U220 GS I queries",
            cutter = "installed full/partial cut shape is not exposed by GS I",
        },
    }
end

local function set_variant(profile, value)
    if value == nil then return true end
    if type(value) ~= "string" then return failure("variant must be A, B, or D") end
    local variant = value:lower()
    if variant ~= "a" and variant ~= "b" and variant ~= "d" then
        return failure("variant must be A, B, or D")
    end
    profile.variant = variant
    profile.variant_candidates = { variant }
    profile.unresolved.variant = nil
    return true
end

local function set_physical(profile, options)
    if options.paper ~= nil then
        profile.paper = paper_aliases[options.paper]
        if not profile.paper then
            return failure("paper must be 76, 69.5, or 57.5 millimeters")
        end
        profile.unresolved.paper = nil
    end
    if options.dip2_1 ~= nil then
        if type(options.dip2_1) ~= "boolean" then return failure("dip2_1 must be boolean") end
        profile.dip2_1 = options.dip2_1
        profile.unresolved.dip2_1 = nil
    end
    if options.cutter ~= nil then
        if options.cutter ~= "partial" and options.cutter ~= "full"
            and options.cutter ~= "none" then
            return failure("cutter must be partial, full, or none")
        end
        profile.cutter = options.cutter
        profile.unresolved.cutter = nil
    end
    return true
end

function M.new(explicit)
    if explicit ~= nil and type(explicit) ~= "table" then
        return failure("explicit profile must be a table")
    end
    local profile = base_profile()
    local ok, err = set_variant(profile, explicit and explicit.variant)
    if not ok then return nil, err end
    ok, err = set_physical(profile, explicit or {})
    if not ok then return nil, err end
    return profile
end

return M
