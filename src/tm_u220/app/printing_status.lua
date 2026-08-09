-- Launches the read-only printing-state inspector without authorization or implicit device I/O.
local HelperProcess = require("tm_u220.app.helper_process")

local M = {}

function M.launch_spec(options)
    options = options or {}
    local arguments = {}
    if options.json then arguments[#arguments + 1] = "--json" end
    if options.check_device then arguments[#arguments + 1] = "--check-device" end
    return HelperProcess.launch_spec("tm-u220-printing-status.mjs",
        "TM-U220 Printing Status", arguments)
end

function M.run(options, runtime)
    local result = HelperProcess.run(M.launch_spec(options), runtime)
    if not result then
        return 1, "TM-U220 Printing Status returned an invalid result"
    end
    if result.ok then return 0 end
    return HelperProcess.exit_code(result),
        "TM-U220 Printing Status found an unhealthy or incomplete configuration"
end

return M
