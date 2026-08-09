-- Adapts canonical rules rendering to shared CLI output and usage-error conventions.
-- Topic knowledge remains owned by the rules renderer rather than command dispatch.
local Rules = require("tm_u220.render.rules")
local Output = require("tm_u220.cli.output")

local M = {}

function M.run(parsed, runtime, output)
    output = output or Output.new(runtime)
    local value, err = Rules.render(parsed.topic)
    if not value then return output:usage_error(err) end
    output:stdout(value)
    return 0
end

return M
