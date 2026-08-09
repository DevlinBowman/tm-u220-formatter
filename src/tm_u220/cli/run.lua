-- Orchestrates CLI parsing, terminal policy, output channels, and canonical handler dispatch.
-- Command behavior lives in responsibility-focused handlers registered against the catalog.
local Handlers = require("tm_u220.cli.handlers")
local Output = require("tm_u220.cli.output")
local Parse = require("tm_u220.cli.parse")
local TerminalGuard = require("tm_u220.cli.terminal_guard")

local M = {}

function M.main(argv, runtime)
    runtime = runtime or {}
    local output = Output.new(runtime)
    local parsed, err = Parse.parse(argv or {})
    if not parsed then return output:usage_error(err) end

    if parsed.command ~= "help" then
        parsed, err = TerminalGuard.validate(parsed, runtime)
        if not parsed then return output:usage_error(err) end
    end

    local handler = Handlers.get(parsed.command)
    if not handler then
        output:error_line("220: command handler is unavailable")
        return 1
    end
    return handler(parsed, runtime, output)
end

return M
