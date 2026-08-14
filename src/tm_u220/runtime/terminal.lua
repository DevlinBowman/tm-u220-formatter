-- Reads terminal facts captured by the shell launcher and exposes the two safety decisions needed by CLI orchestration.
-- Directly injected facts take precedence so callers and tests do not depend on a real terminal.
local M = {}

local MARKERS = {
    stdin_is_tty = "TM_U220_STDIN_IS_TTY",
    stdin_is_stream = "TM_U220_STDIN_IS_STREAM",
    stdout_is_tty = "TM_U220_STDOUT_IS_TTY",
}

local function boolean(value)
    if value == true or value == 1 or value == "1" or value == "true" then
        return true
    end
    if value == false or value == 0 or value == "0" or value == "false" then
        return false
    end
    return nil
end

local function fact(runtime, field)
    local direct = boolean(runtime[field])
    if direct ~= nil then return direct end

    local getenv = runtime.getenv or os.getenv
    return boolean(getenv(MARKERS[field]))
end

function M.snapshot(runtime)
    runtime = runtime or {}
    return {
        stdin_is_tty = fact(runtime, "stdin_is_tty"),
        stdin_is_stream = fact(runtime, "stdin_is_stream"),
        stdout_is_tty = fact(runtime, "stdout_is_tty"),
    }
end

function M.allows_implicit_stdin(runtime)
    local state = M.snapshot(runtime)
    if state.stdin_is_tty == true then return false end
    if state.stdin_is_stream ~= nil then return state.stdin_is_stream end
    return true
end

function M.allows_binary_stdout(runtime)
    return M.snapshot(runtime).stdout_is_tty ~= true
end

return M
