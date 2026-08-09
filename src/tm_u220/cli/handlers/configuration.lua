-- Adapts user-facing configuration editing to the shared CLI status and diagnostic channels.
-- Path selection, seeding, and Vim execution remain owned by the configuration application service.
local ConfigEditor = require("tm_u220.app.config_editor")

local M = {}

local function config_command(_, runtime, output)
    local editor = runtime.config_editor or ConfigEditor
    local status, message = editor.run(runtime.config_runtime)
    if message then output:error_line(message) end
    return status
end

M.handlers = { config = config_command }

return M
