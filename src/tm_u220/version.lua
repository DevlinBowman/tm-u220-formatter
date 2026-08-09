-- Loads the one shipped application version shared by the Lua CLI and distribution manager.
local Defaults = require("tm_u220.app.local_defaults")
local Fs = require("tm_u220.core.fs")

local source, read_error = Fs.read(Defaults.project_root() .. "/VERSION", false)
if not source then error(read_error, 0) end

local value = source:match("^(%d+%.%d+%.%d+)\n?$")
if not value then error("VERSION must contain one semantic version", 0) end

return { value = value }
