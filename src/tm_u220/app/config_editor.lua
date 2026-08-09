-- Launches the fixed unprivileged helper that seeds and edits user authoring configuration.
-- The helper owns filesystem safety and Vim; this boundary only normalizes its process result.
local HelperProcess = require("tm_u220.app.helper_process")
local Validation = require("tm_u220.config.validation")

local M = {}

function M.launch_spec()
    return HelperProcess.launch_spec("tm-u220-config.mjs",
        "TM-U220 Configuration", {})
end

function M.run(runtime)
    runtime = runtime or {}
    local result = HelperProcess.run(M.launch_spec(), runtime)
    if not result then return 1, "TM-U220 Configuration returned an invalid result" end
    local status = HelperProcess.exit_code(result)
    if status ~= 0 then return status end
    local validate = runtime.validate_configuration or Validation.check
    local valid, failure = validate(runtime.validation_runtime)
    if not valid then return 1, failure end
    return 0
end

return M
