-- Adapts checkout-only developer tools to canonical CLI status and error channels.
-- Each tool retains its own environment checks and process-launching policy.
local GlyphEditorLauncher = require("tm_u220.app.glyph_editor_launcher")

local M = {}

local function glyphs_command(_, runtime, output)
    local launcher = runtime.glyph_editor_launcher or GlyphEditorLauncher
    local status, message = launcher.run(runtime.glyph_editor_runtime)
    if message then output:error_line(message) end
    return status
end

M.handlers = { ["dev-glyphs"] = glyphs_command }

return M
