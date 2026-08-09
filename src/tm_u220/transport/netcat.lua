local M = {}

local function shell_quote(value)
    return "'" .. tostring(value):gsub("'", [['"'"']]) .. "'"
end

local function execution_result(ok, kind, code)
    if ok == true or ok == 0 then return { ok = true, exit_code = 0 } end
    if kind == "exit" and type(code) == "number" then
        return { ok = false, exit_code = code }
    end
    return { ok = false, exit_code = nil }
end

local function default_runner(spec)
    local values = {}
    if spec.sudo then
        values[#values + 1] = "sudo"
        values[#values + 1] = "--"
    end
    values[#values + 1] = "nc"
    for _, argument in ipairs(spec.arguments) do
        values[#values + 1] = shell_quote(argument)
    end
    values[#values + 1] = "<"
    values[#values + 1] = shell_quote(spec.stdin_path)
    values[#values + 1] = ">"
    values[#values + 1] = shell_quote(spec.stdout_path)
    values[#values + 1] = "2>"
    values[#values + 1] = shell_quote(spec.stderr_path)
    return execution_result(os.execute(table.concat(values, " ")))
end

local function write_file(open_file, path, value)
    local handle, err = open_file(path, "wb")
    if not handle then error("cannot create transport file: " .. tostring(err), 0) end
    local ok, write_err = handle:write(value)
    local close_ok, close_err = handle:close()
    if not ok then error("cannot write transport file: " .. tostring(write_err), 0) end
    if close_ok == nil then error("cannot close transport file: " .. tostring(close_err), 0) end
end

local function read_file(open_file, path)
    local handle, err = open_file(path, "rb")
    if not handle then error("cannot read transport file: " .. tostring(err), 0) end
    local value = handle:read("*a") or ""
    local close_ok, close_err = handle:close()
    if close_ok == nil then error("cannot close transport file: " .. tostring(close_err), 0) end
    return value
end

local function remove_all(remove, paths)
    for _, path in ipairs(paths) do pcall(remove, path) end
end

local function bind_in_use(stderr)
    local value = tostring(stderr or ""):lower()
    for line in value:gmatch("[^\r\n]+") do
        local bind_at = line:find("bind", 1, true)
        local address_at = line:find("address already in use", 1, true)
        if bind_at and address_at and bind_at < address_at then return true end
    end
    return false
end

local function arguments(endpoint, options)
    local result = { "-w", tostring(options.timeout) }
    if options.source_port then
        result[#result + 1] = "-p"
        result[#result + 1] = tostring(options.source_port)
    end
    result[#result + 1] = endpoint.host
    result[#result + 1] = tostring(endpoint.port)
    return result
end

function M.submit(payload, endpoint, options, runtime)
    options = options or {}
    runtime = runtime or {}
    local open_file = runtime.open or io.open
    local tempname = runtime.tempname or os.tmpname
    local remove = runtime.remove or os.remove
    local runner = runtime.runner or default_runner
    local paths = {}

    local ok, result = xpcall(function()
        local function new_path()
            local path = tempname()
            paths[#paths + 1] = path
            return path
        end
        local input_path, output_path, error_path = new_path(), new_path(), new_path()
        write_file(open_file, input_path, payload)
        write_file(open_file, output_path, "")
        write_file(open_file, error_path, "")

        local execution = runner({
            arguments = arguments(endpoint, options),
            stdin_path = input_path,
            stdout_path = output_path,
            stderr_path = error_path,
            sudo = options.sudo == true,
        })
        local stdout = read_file(open_file, output_path)
        local stderr = read_file(open_file, error_path)
        if type(execution) ~= "table" or type(execution.ok) ~= "boolean" then
            error("transport process runner returned an invalid result", 0)
        end
        return {
            ok = execution.ok,
            exit_code = execution.exit_code,
            stdout = stdout,
            stderr = stderr,
            source_port = options.source_port,
            retryable_bind_in_use = not execution.ok and bind_in_use(stderr),
        }
    end, debug.traceback)

    remove_all(remove, paths)
    if ok then return result end
    return {
        ok = false,
        stdout = "",
        stderr = "transport adapter failed: " .. tostring(result),
        source_port = options.source_port,
        retryable_bind_in_use = false,
    }
end

return M
