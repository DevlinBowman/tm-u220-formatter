-- Launches the browser editor with the selected document parsing mode.
local Defaults = require("tm_u220.app.local_defaults")

local M = {}

local function shell_quote(value)
    return "'" .. tostring(value):gsub("'", "'\\''") .. "'"
end

function M.command(path, options)
    options = options or {}
    local script = Defaults.project_root() .. "/web/server/main.mjs"
    local parts = { "node", shell_quote(script), shell_quote(path) }
    if options.string_input == "raw" or options.text then
        parts[#parts + 1] = "--text"
    end
    if options.profile_path then
        parts[#parts + 1] = "--profile"
        parts[#parts + 1] = shell_quote(options.profile_path)
    end
    if options.alias_path then
        parts[#parts + 1] = "--aliases"
        parts[#parts + 1] = shell_quote(options.alias_path)
    end
    return table.concat(parts, " ")
end

function M.run(path, options, runtime)
    runtime = runtime or {}
    local execute = runtime.execute or os.execute
    local ok, _, code = execute(M.command(path, options))
    if ok then return 0 end
    return tonumber(code) or 1
end

return M
