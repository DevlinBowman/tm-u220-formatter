-- Owns source-only key/value block lifetime without adding runtime operations.
-- Eligible rows become canonical @kv input; rejected candidates return unchanged.
local M = {}
local State = {}
State.__index = State

local MARKERS = {
    ["@kv_start"] = "start",
    ["@kv_end"] = "end",
}

local function boundary(line)
    if type(line) ~= "string" then return nil end
    return MARKERS[line:match("^[ \t]*(.-)[ \t]*$")]
end

local function decorate(line)
    local indentation, payload = line:match("^([ \t]*)(.*)$")
    local suffix = payload:sub(4, 4)
    local explicit = payload:sub(1, 3) == "@kv"
        and (suffix == "" or not suffix:match("[a-z%-]"))
    if explicit then
        return line
    end
    return indentation .. "@kv " .. payload, line
end

local function failure(code, message, line)
    return { code = code, message = message, line = line }
end

function State:process(line, line_number)
    local marker = boundary(line)
    if marker == "start" then
        if self.start_line then
            return nil, failure(
                "job.kv_block.nested",
                "@kv_start cannot be nested inside a key/value block",
                line_number
            )
        end
        self.start_line = line_number
        return nil
    end
    if marker == "end" then
        if not self.start_line then
            return nil, failure(
                "job.kv_block.not_active",
                "@kv_end requires an active @kv_start block",
                line_number
            )
        end
        self.start_line = nil
        return nil
    end
    if self.start_line then
        local candidate, fallback = decorate(line)
        return candidate, nil, fallback, true
    end
    return line
end

function State:finish()
    if not self.start_line then return nil end
    return failure(
        "job.kv_block.unclosed",
        "@kv_start requires a matching @kv_end",
        self.start_line
    )
end

function M.new()
    return setmetatable({}, State)
end

return M
