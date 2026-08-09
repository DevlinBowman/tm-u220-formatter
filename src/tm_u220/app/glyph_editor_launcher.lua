-- Opens the existing checkout glyph-editor launcher through the shared process boundary.
-- Managed releases are rejected because glyph saves intentionally modify repository sources.
local ConfigFiles = require("tm_u220.config.files")
local HelperProcess = require("tm_u220.app.helper_process")

local M = {}

local function exists(path, runtime)
    if runtime and runtime.exists then return runtime.exists(path) == true end
    local handle = io.open(path, "rb")
    if not handle then return false end
    handle:close()
    return true
end

function M.launch_spec(runtime)
    return {
        executable = ConfigFiles.project_root(runtime) .. "/dev/glyphs",
        arguments = {},
        display_name = "TM-U220 glyph editor",
    }
end

function M.run(runtime)
    runtime = runtime or {}
    if ConfigFiles.is_managed_release(runtime) then
        return 1, "220 dev glyphs is available only from a source checkout"
    end
    local spec = M.launch_spec(runtime)
    if not exists(spec.executable, runtime) then
        return 1, "glyph editor launcher is unavailable; run this command from a source checkout"
    end
    local result = HelperProcess.run(spec, runtime)
    if not result then return 1, "glyph editor launcher returned an invalid result" end
    return HelperProcess.exit_code(result)
end

return M
