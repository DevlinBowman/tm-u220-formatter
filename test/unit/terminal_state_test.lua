-- Verifies terminal facts and safety decisions independently of the CLI parser and a physical terminal.
local Terminal = require("tm_u220.runtime.terminal")
local T = require("unit.support")

local tests = {}

tests[#tests + 1] = { "terminal state reads launcher markers", function()
    local values = {
        TM_U220_STDIN_IS_TTY = "1",
        TM_U220_STDIN_IS_STREAM = "0",
        TM_U220_STDOUT_IS_TTY = "0",
    }
    local state = Terminal.snapshot({
        getenv = function(name) return values[name] end,
    })

    T.equal(state.stdin_is_tty, true)
    T.equal(state.stdin_is_stream, false)
    T.equal(state.stdout_is_tty, false)
end }

tests[#tests + 1] = { "injected terminal facts override environment markers", function()
    local state = Terminal.snapshot({
        stdin_is_tty = false,
        stdin_is_stream = true,
        stdout_is_tty = true,
        getenv = function() return "1" end,
    })

    T.equal(state.stdin_is_tty, false)
    T.equal(state.stdin_is_stream, true)
    T.equal(state.stdout_is_tty, true)
end }

tests[#tests + 1] = { "implicit input requires a real non-TTY stream", function()
    T.falsy(Terminal.allows_implicit_stdin({ stdin_is_tty = true }))
    T.falsy(Terminal.allows_implicit_stdin({
        stdin_is_tty = false, stdin_is_stream = false,
    }))
    T.truthy(Terminal.allows_implicit_stdin({
        stdin_is_tty = false, stdin_is_stream = true,
    }))
end }

tests[#tests + 1] = { "binary output rejects a TTY", function()
    T.falsy(Terminal.allows_binary_stdout({ stdout_is_tty = true }))
    T.truthy(Terminal.allows_binary_stdout({ stdout_is_tty = false }))
end }

tests[#tests + 1] = { "unknown terminal state preserves direct Lua compatibility", function()
    local runtime = { getenv = function() return nil end }
    local state = Terminal.snapshot(runtime)

    T.equal(state.stdin_is_tty, nil)
    T.equal(state.stdin_is_stream, nil)
    T.equal(state.stdout_is_tty, nil)
    T.truthy(Terminal.allows_implicit_stdin(runtime))
    T.truthy(Terminal.allows_binary_stdout(runtime))
end }

return tests
