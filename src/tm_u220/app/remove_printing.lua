-- Launches the printer-policy removal planner as the ordinary invoking account.
-- The Node helper owns auditing; only its explicit --remove path may request administration.
local HelperProcess = require("tm_u220.app.helper_process")

local M = {}

function M.launch_spec(options)
    options = options or {}
    local arguments = {}
    if options.remove then arguments[#arguments + 1] = "--remove" end
    if options.json then arguments[#arguments + 1] = "--json" end
    return HelperProcess.launch_spec("tm-u220-remove-printing.mjs",
        "TM-U220 Printing Policy Removal", arguments)
end

function M.run(options, runtime)
    local result = HelperProcess.run(M.launch_spec(options), runtime)
    if not result then
        return 1, "TM-U220 Printing Policy Removal returned an invalid result"
    end
    if result.ok then return 0 end
    return HelperProcess.exit_code(result)
end

return M
