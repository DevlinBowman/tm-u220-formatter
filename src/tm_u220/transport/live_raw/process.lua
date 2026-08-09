-- Runs the live helper and validates its result against the submitted installed-route manifest.
local Json = require("tm_u220.core.json")
local Policy = require("tm_u220.transport.live_raw.policy")

local M = {}

local function quote(value)
    return "'" .. tostring(value):gsub("'", [['"'"']]) .. "'"
end

local function helper_path()
    local source = (debug.getinfo(1, "S") or {}).source or ""
    if source:sub(1, 1) == "@" then source = source:sub(2) end
    local suffix = "src/tm_u220/transport/live_raw/process.lua"
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
    local command = table.concat({ "node", quote(spec.helper_path),
        quote(spec.plan_path), quote(spec.result_path) }, " ")
    return execution_result(os.execute(command))
end

local function write(path, value, open_file)
    local file, err = open_file(path, "wb")
    if not file then return nil, err end
    local ok, write_err = file:write(value)
    local close_ok, close_err = file:close()
    if not ok then return nil, write_err end
    if close_ok == nil then return nil, close_err end
    return true
end

local function read(path, open_file)
    local file, err = open_file(path, "rb")
    if not file then return nil, err end
    local value = file:read("*a") or ""
    local close_ok, close_err = file:close()
    if close_ok == nil then return nil, close_err end
    return value
end

local function decode(value)
    return (value:gsub("%%(%x%x)", function(pair)
        return string.char(tonumber(pair, 16))
    end))
end

local function fields(record)
    local values = {}
    record = tostring(record or ""):gsub("\n$", "")
    if record:find("[\r\n]") then return nil end
    for value in (record .. "\t"):gmatch("(.-)\t") do
        values[#values + 1] = decode(value)
    end
    return values
end

local function number(value)
    if type(value) ~= "string" or not value:match("^%d+$") then return nil end
    return tonumber(value)
end

local function authorized_port(manifest, value)
    for _, port in ipairs(manifest.source_ports or {}) do
        if value == port then return true end
    end
    return false
end

local function confirmed_prefix(manifest, count)
    local bytes, lines = 0, 0
    for index = 1, count do
        local step = manifest.steps[index]
        if not step then return nil end
        bytes = bytes + #step.payload_hex / 2
        if step.preview_line_index then lines = lines + 1 end
    end
    return bytes, lines
end

local function valid_confirmation(manifest, steps, lines, bytes)
    if steps < 0 or steps > #manifest.steps then return false end
    local expected_bytes, expected_lines = confirmed_prefix(manifest, steps)
    return expected_bytes == bytes and expected_lines == lines
end

local function parse_result(record, execution, manifest)
    local value = fields(record)
    if not value then return nil, "live helper returned a malformed result" end
    if value[1] == "completed" or value[1] == "cancelled" then
        local source_port = number(value[2])
        local steps, lines = number(value[3]), number(value[4])
        local confirmed_bytes, payload_bytes = number(value[5]), number(value[6])
        if not source_port or not steps or not lines or not confirmed_bytes
            or not payload_bytes then
            return nil, "live helper returned invalid completion counters"
        end
        local cancelled = value[1] == "cancelled"
        if cancelled and execution.exit_code ~= 130 then
            return nil, "live helper cancellation status did not match its exit code"
        end
        if not cancelled and not execution.ok then
            return nil, "live helper completion status did not match its exit code"
        end
        if not authorized_port(manifest, source_port)
            or payload_bytes ~= manifest.payload_bytes
            or not valid_confirmation(manifest, steps, lines, confirmed_bytes)
            or (cancelled and steps >= #manifest.steps)
            or (not cancelled and steps ~= #manifest.steps) then
            return nil, "live helper returned counters that do not match the plan"
        end
        return {
            status = value[1],
            cancelled = cancelled,
            source_port = source_port,
            steps_confirmed = steps,
            lines_confirmed = lines,
            bytes_submitted = confirmed_bytes,
            payload_bytes = payload_bytes,
        }
    end
    if value[1] == "error" then
        local step, confirmed_steps = number(value[4]), number(value[5])
        local confirmed_lines, confirmed_bytes = number(value[6]), number(value[7])
        local released_bytes, unknown = number(value[8]), number(value[9])
        if not value[2] or not value[3] or not step or not confirmed_steps
            or not confirmed_lines or not confirmed_bytes or not released_bytes
            or not unknown or not value[10] then
            return nil, "live helper returned invalid failure fields"
        end
        local source_port = number(value[11])
        if execution.ok or not source_port
            or (source_port ~= 0 and not authorized_port(manifest, source_port))
            or step > #manifest.steps
            or unknown > 1
            or released_bytes < confirmed_bytes
            or released_bytes > manifest.payload_bytes
            or not valid_confirmation(
                manifest, confirmed_steps, confirmed_lines, confirmed_bytes) then
            return nil, "live helper returned failure counters that do not match the plan"
        end
        return nil, value[10], {
            code = value[2], stage = value[3], step = step,
            steps_confirmed = confirmed_steps,
            lines_confirmed = confirmed_lines,
            bytes_confirmed = confirmed_bytes,
            bytes_released = released_bytes,
            outcome_unknown = unknown == 1,
            source_port = source_port ~= 0 and source_port or nil,
        }
    end
    return nil, "live helper returned an unknown result status"
end

function M.submit(manifest, runtime)
    runtime = runtime or {}
    local executable = runtime.helper_path or helper_path()
    if not executable then return nil, "cannot locate the live session helper" end
    local open_file = runtime.open or io.open
    local tempname = runtime.tempname or os.tmpname
    local remove = runtime.remove or os.remove
    local runner = runtime.runner or default_runner
    local paths = { tempname(), tempname() }
    local called, result, message, detail = xpcall(function()
        local ok, err = write(paths[1], Json.encode(manifest) .. "\n", open_file)
        if not ok then error("cannot write live plan: " .. tostring(err), 0) end
        ok, err = write(paths[2], "", open_file)
        if not ok then error("cannot create live result: " .. tostring(err), 0) end
        local execution = runner({ helper_path = executable,
            plan_path = paths[1], result_path = paths[2] })
        if type(execution) ~= "table" or type(execution.ok) ~= "boolean" then
            error("live runner returned an invalid execution result", 0)
        end
        local record, read_err = read(paths[2], open_file)
        if not record then error("cannot read live result: " .. tostring(read_err), 0) end
        return parse_result(record, execution, manifest)
    end, debug.traceback)
    for _, path in ipairs(paths) do pcall(remove, path) end
    if not called then return nil, tostring(result):gsub("[\r\n]+", " ") end
    return result, message, detail
end

return M
