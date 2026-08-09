-- Builds and runs fixed helper process specifications shared by application services.
-- Callers own allowed executable construction, feature policy, and user-facing messages.
local Defaults = require("tm_u220.app.local_defaults")

local M = {}

local function shell_quote(value)
    return "'" .. tostring(value):gsub("'", "'\\''") .. "'"
end

local function execution_result(ok, kind, code)
    if ok == true or ok == 0 then return { ok = true, exit_code = 0 } end
    if kind == "exit" and type(code) == "number" then
        return { ok = false, exit_code = code }
    end
    return { ok = false, exit_code = 1 }
end

function M.launch_spec(helper_name, display_name, arguments)
    local values = {
        Defaults.project_root() .. "/libexec/" .. helper_name,
    }
    for _, argument in ipairs(arguments or {}) do
        values[#values + 1] = argument
    end
    return {
        executable = "node",
        arguments = values,
        display_name = display_name,
    }
end

function M.command(spec)
    local command = shell_quote(spec.executable)
    for _, argument in ipairs(spec.arguments) do
        command = command .. " " .. shell_quote(argument)
    end
    return command
end

local function default_runner(spec)
    return execution_result(os.execute(M.command(spec)))
end

function M.run(spec, runtime)
    runtime = runtime or {}
    local result = (runtime.runner or default_runner)(spec)
    if type(result) ~= "table" or type(result.ok) ~= "boolean" then return nil end
    return result
end

function M.exit_code(result)
    if result.ok then return 0 end
    local code = type(result.exit_code) == "number" and result.exit_code or 1
    if code == 64 then return 2 end
    return code
end

return M
