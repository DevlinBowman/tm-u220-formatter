-- Applies terminal-safety policy after parsing and before any command service can perform I/O.
-- Explicit standard input remains allowed, while hazardous implicit input and binary output are rejected.
local Terminal = require("tm_u220.runtime.terminal")

local M = {}

local function terminal_runtime(runtime)
    runtime = runtime or {}
    return runtime.terminal_runtime or runtime
end

function M.validate(parsed, runtime)
    local facts = terminal_runtime(runtime)
    if parsed.implicit_stdin and not Terminal.allows_implicit_stdin(facts) then
        return nil, "input required when standard input is a terminal"
    end
    local output = parsed.options and parsed.options.output
    local binary_stdout = parsed.command == "compile" and not parsed.options.hex
        and (output == nil or output == "-")
    if binary_stdout and not Terminal.allows_binary_stdout(facts) then
        return nil, "compile binary output requires --hex or -o FILE when standard output is a terminal"
    end
    return parsed
end

return M
