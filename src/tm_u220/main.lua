local Run = require("tm_u220.cli.run")

local M = {}

function M.main(argv, runtime)
    local run = runtime and runtime.run or Run.main
    local code = run(argv or {}, runtime)
    local exit = runtime and runtime.exit or os.exit
    return exit(code)
end

return M
