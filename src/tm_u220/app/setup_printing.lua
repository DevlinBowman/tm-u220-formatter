-- Launches the reviewed macOS installer for the narrow live and LPD connections.
local HelperProcess = require("tm_u220.app.helper_process")

local M = {}

function M.launch_spec(options)
    options = options or {}
    local arguments = {}
    if options.host then
        arguments[#arguments + 1] = "--host"
        arguments[#arguments + 1] = options.host
    end
    if options.profile_path then
        arguments[#arguments + 1] = "--profile"
        arguments[#arguments + 1] = options.profile_path
    end
    return HelperProcess.launch_spec("tm-u220-setup-printing.mjs",
        "TM-U220 Printing Setup", arguments)
end

function M.run(options, runtime)
    options = options or {}
    local result = HelperProcess.run(M.launch_spec(options), runtime)
    if not result then
        return 1, "TM-U220 Printing Setup returned an invalid result"
    end
    if result.ok then return 0 end
    -- The helper owns its precise failure text; do not append a second generic diagnosis.
    return HelperProcess.exit_code(result)
end

return M
