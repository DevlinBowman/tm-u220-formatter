-- Defines the explicit raw and formatted string types shared by app entry points.
-- It retains the legacy text boolean only at the Lua API boundary.
local M = {}

M.RAW = "raw"
M.FORMATTED = "formatted"

local MODES = {
    [M.RAW] = "plain",
    [M.FORMATTED] = "interpreted",
}

function M.resolve(options)
    options = options or {}
    local requested = options.string_input
    if requested == nil and (options.text == true or options.force_text == true) then
        requested = M.RAW
    end
    if requested == nil then return "interpreted", false end

    local mode = MODES[requested]
    if mode == nil then
        return nil, true, "string input must be raw or formatted"
    end
    return mode, true
end

return M
