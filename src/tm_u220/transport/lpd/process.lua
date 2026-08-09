-- Runs the fixed LPD session helper and validates its machine-readable result.
local Policy = require("tm_u220.transport.lpd.policy")

local M = {}

local function quote(value)
    return "'" .. tostring(value):gsub("'", [['"'"']]) .. "'"
end

local function helper_path()
    local source = (debug.getinfo(1, "S") or {}).source or ""
    if source:sub(1, 1) == "@" then source = source:sub(2) end
    local suffix = "src/tm_u220/transport/lpd/process.lua"
    if source:sub(-#suffix) ~= suffix then return nil end
    local root = source:sub(1, #source - #suffix)
    if root == "" then root = "./" end
    return root .. "libexec/" .. Policy.helper_name
end

local function execution_result(ok, kind, code)
    if ok == true or ok == 0 then return { ok = true, exit_code = 0 } end
    if kind == "exit" and type(code) == "number" then
        return { ok = false, exit_code = code }
    end
    return { ok = false, exit_code = nil }
end

local function default_runner(spec)
    local command = table.concat({
        quote(spec.executable), "<", quote(spec.stdin_path),
        ">", quote(spec.stdout_path), "2>", quote(spec.stderr_path),
    }, " ")
    return execution_result(os.execute(command))
end

local function write(path, value, open_file)
    local file, err = open_file(path, "wb")
    if not file then error("cannot create LPD session file: " .. tostring(err), 0) end
    local ok, write_err = file:write(value)
    local close_ok, close_err = file:close()
    if not ok then error("cannot write LPD session file: " .. tostring(write_err), 0) end
    if close_ok == nil then error("cannot close LPD session file: " .. tostring(close_err), 0) end
end

local function read(path, open_file)
    local file, err = open_file(path, "rb")
    if not file then error("cannot read LPD session file: " .. tostring(err), 0) end
    local value = file:read("*a") or ""
    local close_ok, close_err = file:close()
    if close_ok == nil then error("cannot close LPD session file: " .. tostring(close_err), 0) end
    return value
end

local function failure(code, message, fields)
    local result = { ok = false, code = code, message = message,
        lpd_acceptance = "unknown" }
    for key, value in pairs(fields or {}) do result[key] = value end
    return result
end

local function parse_success(output, payload_size, route)
    local bytes, acks, source_port = output:match(
        "^ok bytes=(%d+) acks=(%d+) source_port=(%d+)\n$")
    source_port = tonumber(source_port)
    if tonumber(bytes) ~= payload_size or tonumber(acks) ~= 5
        or not Policy.authorizes_source_port(source_port, route) then
        return nil
    end
    return { ok = true, source_port = source_port, ack_count = 5,
        acks = { 0, 0, 0, 0, 0 } }
end

local function parse_failure(output, exit_code, stderr, route)
    local helper_code, stage, ack, count, message, source_port = output:match(
        "^error code=([a-z_]+) stage=([a-z_]+) ack=([a-z0-9]+) "
            .. "acks=(%d+) message=([a-z_]+) source_port=(%d+)\n$")
    source_port = tonumber(source_port)
    if not helper_code or (source_port ~= 0
        and not Policy.authorizes_source_port(source_port, route)) then
        return failure("LPD_SESSION_FAILED",
            "LPD session helper returned an invalid failure record", {
                helper_code = "invalid_record", exit_code = exit_code, stderr = stderr })
    end
    local rejected = helper_code == "lpd_rejected"
    local detail = tostring(stderr or ""):gsub("[%c]+", " ")
        :gsub("^%s+", ""):gsub("%s+$", "")
    if #detail > 240 then detail = detail:sub(1, 237) .. "..." end
    local lowered = detail:lower()
    local authorization_missing = lowered:match("password is required")
        or lowered:match("not allowed to execute")
        or lowered:match("not in the sudoers file")
    local failure_message
    if authorization_missing then
        failure_message = "LPD printing authorization is unavailable; "
            .. "run 220 setup-printing"
    elseif message == "ack_eof" then
        failure_message = string.format(
            "LPD connection closed while awaiting %s acknowledgement (%d/5 received)",
            stage:gsub("_", "-"), tonumber(count))
    elseif message == "ack_timeout" then
        failure_message = string.format(
            "LPD acknowledgement timed out at %s (%d/5 received)",
            stage:gsub("_", "-"), tonumber(count))
    else
        failure_message = message:gsub("_", " ") .. " at " .. stage:gsub("_", "-")
    end
    if detail ~= "" and not authorization_missing then
        failure_message = failure_message .. ": " .. detail
    end
    return failure(rejected and "LPD_REJECTED" or "LPD_SESSION_FAILED",
        failure_message, {
            helper_code = helper_code, stage = stage,
            source_port = source_port ~= 0 and source_port or nil,
            ack = ack == "none" and nil or tonumber(ack),
            ack_count = tonumber(count), exit_code = exit_code,
            stderr = stderr, lpd_acceptance = rejected and "rejected" or "unknown",
        })
end

function M.submit(envelope, endpoint, options, runtime)
    local valid, policy_error = Policy.validate(envelope, endpoint, options)
    if not valid then
        return failure("LPD_SESSION_POLICY_MISMATCH", policy_error)
    end
    runtime = runtime or {}
    local executable = runtime.helper_path or helper_path()
    if not executable then
        return failure("LPD_SESSION_FAILED", "cannot locate the project LPD session helper")
    end
    local open_file, tempname = runtime.open or io.open, runtime.tempname or os.tmpname
    local remove, runner = runtime.remove or os.remove, runtime.runner or default_runner
    local paths = { tempname(), tempname(), tempname() }
    local called, result = xpcall(function()
        write(paths[1], envelope.payload, open_file)
        write(paths[2], "", open_file)
        write(paths[3], "", open_file)
        local execution = runner({ executable = executable,
            stdin_path = paths[1], stdout_path = paths[2], stderr_path = paths[3] })
        if type(execution) ~= "table" or type(execution.ok) ~= "boolean" then
            error("LPD session runner returned an invalid result", 0)
        end
        local stdout, stderr = read(paths[2], open_file), read(paths[3], open_file)
        if execution.ok then
            local success = stderr == ""
                and parse_success(stdout, #envelope.payload, options.route)
            if success then return success end
            return failure("LPD_SESSION_FAILED",
                "LPD session helper returned an invalid success record", {
                    helper_code = "invalid_record", exit_code = execution.exit_code,
                    stderr = stderr })
        end
        return parse_failure(stdout, execution.exit_code, stderr, options.route)
    end, debug.traceback)
    for _, path in ipairs(paths) do pcall(remove, path) end
    if called then return result end
    return failure("LPD_SESSION_FAILED", tostring(result):gsub("[\r\n]+", " "), {
        helper_code = "internal" })
end

return M
