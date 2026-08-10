-- Adapts image-profile editing to the public CLI while resolving only the active printer profile.
-- The isolated editor helper owns safe image-profile selection, seeding, preview, and persistence.
local ConfigFiles = require("tm_u220.config.files")
local Diagnostics = require("tm_u220.core.diagnostics")
local ImageProfileEditor = require("tm_u220.app.image_profile_editor_launcher")

local M = {}

local function image_profile_command(parsed, runtime, output)
    local files = runtime.config_files or ConfigFiles
    local profile, failure = files.active_path(
        "profile", runtime.config_files_runtime)
    if not profile then
        output:diagnostics({ Diagnostics.new(
            "AUTHORING_CONFIG_PATH_INVALID", failure) })
        return 1
    end
    local launcher = runtime.image_profile_editor_launcher or ImageProfileEditor
    local status, message = launcher.run(parsed.input, {
        profile_path = profile,
    }, runtime.image_profile_editor_runtime)
    if message then output:error_line(message) end
    return status
end

M.handlers = { ["image-profile"] = image_profile_command }

return M
