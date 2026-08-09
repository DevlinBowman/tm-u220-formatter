-- Resolves repository-relative authoring defaults and helper locations for this installation.
-- Machine-specific printing choices live in the installed policy, never in this module.
local ConfigFiles = require("tm_u220.config.files")

local M = {}

M.PROFILE_RELATIVE_PATH = "config/printers/local.u220p"

function M.project_root()
    return ConfigFiles.project_root()
end

function M.profile_path(root)
    return ConfigFiles.factory_path("profile", root and { project_root = root } or nil)
end

return M
