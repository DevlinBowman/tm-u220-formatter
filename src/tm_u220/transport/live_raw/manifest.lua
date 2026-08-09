-- Serializes a checkpoint plan with the exact route authorized by the installed manifest.
local Bytes = require("tm_u220.core.bytes")
local Policy = require("tm_u220.transport.live_raw.policy")

local M = {}

local function compact_hex(value)
    return Bytes.to_hex(value):gsub(" ", ""):lower()
end

local function reset_offsets(step)
    local source = step.reset_after_byte_offsets
    if type(source) ~= "table" or type(step.payload_bytes) ~= "string" then
        return nil
    end
    local count, previous, offsets = #source, 0, {}
    for key in pairs(source) do
        if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > count then
            return nil
        end
    end
    for index, offset in ipairs(source) do
        if type(offset) ~= "number" or offset % 1 ~= 0
            or offset <= previous or offset > #step.payload_bytes then
            return nil
        end
        offsets[index] = offset
        previous = offset
    end
    return offsets
end

function M.build(plan, endpoint, options)
    options = options or {}
    local valid, route_or_err = Policy.validate(plan, endpoint, options)
    local err = route_or_err
    if not valid then return nil, err end
    local route = route_or_err

    local steps = {}
    for index, step in ipairs(plan.steps) do
        local offsets = type(step) == "table" and reset_offsets(step) or nil
        if type(step) ~= "table" or step.index ~= index
            or not ({ line = true, motion = true, cut = true, control = true })[step.kind]
            or type(step.payload_bytes) ~= "string" or step.payload_bytes == ""
            or not offsets then
            return nil, "live checkpoint step " .. index .. " is invalid"
        end
        steps[index] = {
            index = index,
            kind = step.kind,
            payload_hex = compact_hex(step.payload_bytes),
            display = step.display,
            preview_line_index = step.preview_line_index,
            reset_after_byte_offsets = offsets,
        }
    end
    if #steps == 0 then return nil, "live checkpoint plan has no steps" end

    local ports = {}
    for index, port in ipairs(route.source_ports) do ports[index] = port end
    return {
        version = 1,
        host = route.host,
        port = route.port,
        source_ports = ports,
        timeout_ms = options.timeout_ms or Policy.timeout_ms,
        silent = options.silent == true,
        payload_bytes = #plan.payload_bytes,
        line_count = plan.line_count,
        steps = steps,
    }
end

return M
