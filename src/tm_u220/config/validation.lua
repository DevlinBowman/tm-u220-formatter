-- Validates the effective editable aliases and authoring profile after Vim closes.
-- Grammar ownership stays with the existing alias and profile parsers rather than the editor helper.
local AliasCatalog = require("tm_u220.job.directive.alias_catalog")
local ConfigFiles = require("tm_u220.config.files")
local Diagnostics = require("tm_u220.core.diagnostics")
local Directive = require("tm_u220.job.directive")
local Fs = require("tm_u220.core.fs")
local ProfileFile = require("tm_u220.profile.file")
local ImageProfile = require("tm_u220.printhead.image_profile")

local M = {}

local function target_text(target)
    return "@" .. target[1] .. (target[2] and " " .. target[2] or "")
end

local function validate_alias_targets(catalog, path)
    for _, mapping in ipairs(catalog.mappings or {}) do
        for _, target in ipairs(mapping.targets or {}) do
            if not Directive.is_canonical(target[1]) then
                return nil, string.format(
                    "directive aliases are invalid: %s: @%s targets unknown directive @%s",
                    path, mapping.name, target[1])
            end
            if target[2] ~= "*" then
                local operation, failure = Directive.parse(target_text(target), nil, {})
                if not operation then
                    return nil, string.format(
                        "directive aliases are invalid: %s: @%s target %s: %s",
                        path, mapping.name, target_text(target), failure.message)
                end
            end
        end
    end
    return catalog
end

local function effective_path(name, runtime)
    local files = runtime.files or ConfigFiles
    local path, failure = files.active_path(name, runtime.files_runtime)
    if not path then return nil, failure end
    return path
end

function M.check(runtime)
    runtime = runtime or {}
    local aliases_path, path_failure = effective_path("aliases", runtime)
    if not aliases_path then return nil, path_failure end
    local aliases, alias_failure = AliasCatalog.load(aliases_path)
    if not aliases then
        return nil, "directive aliases are invalid: " .. alias_failure.message
    end
    aliases, alias_failure = validate_alias_targets(aliases, aliases_path)
    if not aliases then return nil, alias_failure end

    local profile_path
    profile_path, path_failure = effective_path("profile", runtime)
    if not profile_path then return nil, path_failure end
    local source, read_failure = Fs.read(profile_path, false)
    if not source then
        return nil, "authoring profile is unreadable: " .. read_failure
    end
    local profile = ProfileFile.parse(source)
    if Diagnostics.has_errors(profile.diagnostics) then
        return nil, "authoring profile is invalid: "
            .. Diagnostics.format(profile.diagnostics[1])
    end

    local image_profile_path
    image_profile_path, path_failure = effective_path("image_profile", runtime)
    if not image_profile_path then return nil, path_failure end
    source, read_failure = Fs.read(image_profile_path, false)
    if not source then
        return nil, "image interpretation profile is unreadable: " .. read_failure
    end
    local image_profile = ImageProfile.parse(source)
    if Diagnostics.has_errors(image_profile.diagnostics) then
        return nil, "image interpretation profile is invalid: "
            .. Diagnostics.format(image_profile.diagnostics[1])
    end

    return { aliases_path = aliases_path, profile_path = profile_path,
        image_profile_path = image_profile_path }
end

return M
