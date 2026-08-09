local Diagnostics = require("tm_u220.core.diagnostics")
local Preview = require("tm_u220.render.preview")
local M = {}

local OUTPUT_COMMANDS = {
    ["print.line_feed"] = "line",
    ["print.feed_lines"] = "motion",
    ["print.feed_units"] = "motion",
    ["print.reverse_feed_lines"] = "motion",
    ["print.reverse_feed_units"] = "motion",
    ["mechanism.cut"] = "cut",
}
local function failure(code, message, span)
    return {
        diagnostics = { Diagnostics.new(code, message, span) },
    }
end
local function dense_array(values)
    if type(values) ~= "table" then return false end
    local count = #values
    for key in pairs(values) do
        if type(key) ~= "number" or key % 1 ~= 0
            or key < 1 or key > count then
            return false
        end
    end
    return true
end

local function copy(values)
    local result = {}
    for key, value in pairs(values or {}) do result[key] = value end
    return result
end

local function join_parts(parts, first, last)
    local values = {}
    for index = first, last do values[#values + 1] = parts[index].bytes end
    return table.concat(values)
end

local function reset_offsets(parts, first, last)
    local offsets = {}
    local byte_count = 0
    for index = first, last do
        local part = parts[index]
        byte_count = byte_count + #part.bytes
        if part.command_id == "control.initialize" then
            offsets[#offsets + 1] = byte_count
        end
    end
    return offsets
end

local function validate_parts(compilation)
    local nodes = compilation.nodes
    local parts = compilation.encoded_parts
    if not dense_array(nodes) or not dense_array(parts) or #nodes ~= #parts then
        return nil, failure("LIVE_PLAN_INVALID_PARTS",
            "compiled nodes and encoded parts must be matching dense arrays")
    end

    local values = {}
    local cursor = 1
    for index, part in ipairs(parts) do
        local node = nodes[index]
        local node_kind = type(node) == "table" and node.kind or nil
        local command_id = node_kind == "command" and node.id or nil
        if type(node) ~= "table" or type(part) ~= "table"
            or part.node_index ~= index
            or part.node_kind ~= node_kind
            or part.command_id ~= command_id
            or type(part.bytes) ~= "string"
            or part.byte_first ~= cursor
            or part.byte_last ~= cursor + #part.bytes - 1 then
            return nil, failure("LIVE_PLAN_INVALID_PARTS",
                "encoded part metadata does not match node " .. index,
                { node_index = index })
        end
        values[index] = part.bytes
        cursor = part.byte_last + 1
    end

    local assembled = table.concat(values)
    if type(compilation.bytes) ~= "string" or assembled ~= compilation.bytes then
        return nil, failure("LIVE_PLAN_BYTES_MISMATCH",
            "encoded node parts do not reassemble the compiled byte stream")
    end
    return assembled
end

local function validate_boundaries(compilation)
    local boundaries = compilation.print_boundaries
    local lines = compilation.preview_lines
    if not dense_array(boundaries) or not dense_array(lines) then
        return nil, failure("LIVE_PLAN_INVALID_BOUNDARIES",
            "print boundaries and preview lines must be dense arrays")
    end

    local previous_node = 0
    local next_line = 1
    local marked = {}
    for index, boundary in ipairs(boundaries) do
        local node_index = type(boundary) == "table"
            and boundary.after_node_index or nil
        if type(node_index) ~= "number" or node_index % 1 ~= 0
            or node_index <= previous_node or node_index > #compilation.nodes then
            return nil, failure("LIVE_PLAN_INVALID_BOUNDARY",
                "print boundary " .. index .. " has an invalid node index")
        end

        local node = compilation.nodes[node_index]
        local expected_kind = node and node.kind == "command"
            and OUTPUT_COMMANDS[node.id] or nil
        if expected_kind ~= boundary.kind or boundary.command_id ~= node.id then
            return nil, failure("LIVE_PLAN_INVALID_BOUNDARY",
                "print boundary " .. index .. " does not match its output command",
                { node_index = node_index })
        end

        local line_index = boundary.preview_line_index
        if boundary.kind == "line" and line_index == nil then
            return nil, failure("LIVE_PLAN_PREVIEW_MISMATCH",
                "line boundary " .. index .. " has no preview line")
        end
        if boundary.kind == "cut" and line_index ~= nil then
            return nil, failure("LIVE_PLAN_PREVIEW_MISMATCH",
                "cut boundary " .. index .. " cannot map a preview line")
        end
        if line_index ~= nil then
            if type(line_index) ~= "number" or line_index % 1 ~= 0
                or line_index ~= next_line or lines[line_index] == nil then
                return nil, failure("LIVE_PLAN_PREVIEW_MISMATCH",
                    "print boundary " .. index .. " has an invalid preview line")
            end
            next_line = next_line + 1
        end

        previous_node = node_index
        marked[node_index] = true
    end

    for index, node in ipairs(compilation.nodes) do
        if node.kind == "command" and OUTPUT_COMMANDS[node.id] and not marked[index] then
            return nil, failure("LIVE_PLAN_INVALID_BOUNDARY",
                "output command has no print boundary", { node_index = index })
        end
    end
    if next_line - 1 ~= #lines then
        return nil, failure("LIVE_PLAN_PREVIEW_MISMATCH",
            "not every preview line is mapped to a print boundary")
    end
    return true
end

function M.build(compilation)
    if type(compilation) ~= "table" then
        return failure("LIVE_PLAN_INVALID_INPUT", "compilation must be a table")
    end
    if Diagnostics.has_errors(compilation.diagnostics) then
        return failure("LIVE_PLAN_COMPILE_ERRORS",
            "a checkpoint plan cannot be built from a failed compilation")
    end

    local payload, part_failure = validate_parts(compilation)
    if not payload then return part_failure end
    local boundaries_ok, boundary_failure = validate_boundaries(compilation)
    if not boundaries_ok then return boundary_failure end

    local steps = {}
    local first_node = 1
    for _, boundary in ipairs(compilation.print_boundaries) do
        local last_node = boundary.after_node_index
        local line_index = boundary.preview_line_index
        local line = line_index and compilation.preview_lines[line_index] or nil
        local bytes = join_parts(compilation.encoded_parts, first_node, last_node)
        steps[#steps + 1] = {
            index = #steps + 1,
            kind = boundary.kind,
            node_first = first_node,
            node_last = last_node,
            payload_bytes = bytes,
            payload_byte_count = #bytes,
            reset_after_byte_offsets = reset_offsets(
                compilation.encoded_parts, first_node, last_node),
            action = copy(boundary),
            preview_line_index = line_index,
            preview_line = line,
            display = line and Preview.format_line(line_index, line) or nil,
        }
        first_node = last_node + 1
    end

    if first_node <= #compilation.encoded_parts then
        for index = first_node, #compilation.nodes do
            if compilation.nodes[index].kind == "text" then
                return failure("LIVE_PLAN_UNPRINTED_TEXT",
                    "printable text remains after the final print boundary",
                    { node_index = index })
            end
        end
        local bytes = join_parts(
            compilation.encoded_parts, first_node, #compilation.encoded_parts)
        steps[#steps + 1] = {
            index = #steps + 1,
            kind = "control",
            node_first = first_node,
            node_last = #compilation.encoded_parts,
            payload_bytes = bytes,
            payload_byte_count = #bytes,
            reset_after_byte_offsets = reset_offsets(
                compilation.encoded_parts, first_node, #compilation.encoded_parts),
            action = { kind = "control", reason = "trailing_control" },
        }
    end

    local reassembled = {}
    for index, step in ipairs(steps) do reassembled[index] = step.payload_bytes end
    if table.concat(reassembled) ~= payload then
        return failure("LIVE_PLAN_BYTES_MISMATCH",
            "checkpoint steps do not reassemble the compiled byte stream")
    end

    return {
        steps = steps,
        payload_bytes = payload,
        payload_byte_count = #payload,
        line_count = #compilation.preview_lines,
        diagnostics = {},
    }
end

return M
