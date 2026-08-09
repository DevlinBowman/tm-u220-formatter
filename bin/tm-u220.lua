-- Loads the CLI from the installation resolved by the shell wrapper and returns its exit status.
local Tool = require("tm_u220.main")
local entry = Tool["main"]
if type(entry) ~= "function" then
    error("module tm_u220.main does not export main()", 0)
end
entry(arg)
