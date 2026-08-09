-- Invokes fixed companion-image helpers and validates their compact binary protocols.
-- Node owns safe file access and PNG decoding; Lua receives only exact bytes or grayscale data.
local HelperProcess = require("tm_u220.app.helper_process")

local M = {}
local SUCCESS = "U220ASSET1\n"
local GRAYSCALE = "U220GRAY1\n"
local FAILURE = "U220ERROR1\n"
local MAXIMUM_DIMENSION = 4096
local MAXIMUM_PIXELS = 4 * 1024 * 1024

local function default_capture(spec)
    local handle = io.popen(HelperProcess.command(spec), "r")
    if not handle then return nil end
    local output = handle:read("*a")
    local ok = handle:close()
    if not ok then return nil end
    return output
end

local function request(helper, display_name, base_path, reference, maximum_bytes, runtime,
        base_kind)
    runtime = runtime or {}
    local arguments = { base_path, reference, tostring(maximum_bytes) }
    if base_kind then arguments[#arguments + 1] = base_kind end
    local spec = HelperProcess.launch_spec(helper, display_name, arguments)
    local output = (runtime.capture or default_capture)(spec)
    return output
end

local function failure(output)
    return output:match("^U220ERROR1\n([A-Z_]+)\n$") or "READ_FAILED"
end

function M.read(document_path, reference, maximum_bytes, runtime)
    local output = request("image_assets/read.mjs", "TM-U220 image asset reader",
        document_path, reference, maximum_bytes, runtime)
    if type(output) ~= "string" then return nil, "READ_FAILED" end
    if output:sub(1, #SUCCESS) == SUCCESS then
        local data = output:sub(#SUCCESS + 1)
        if #data >= 1 and #data <= maximum_bytes then return data end
    end
    return nil, failure(output)
end

local function positive_decimal(value)
    if not value:match("^[1-9]%d*$") then return nil end
    local number = tonumber(value)
    if not number or number % 1 ~= 0 or number > math.maxinteger then return nil end
    return number
end

local function grayscale_payload(output, maximum_bytes)
    local body = output:sub(#GRAYSCALE + 1)
    local newline = body:find("\n", 1, true)
    if not newline then return nil end
    local width_text, height_text, source_text = body:sub(1, newline - 1)
        :match("^(%d+) (%d+) (%d+)$")
    if not width_text then return nil end
    local width = positive_decimal(width_text)
    local height = positive_decimal(height_text)
    local source_bytes = positive_decimal(source_text)
    if not width or not height or not source_bytes or source_bytes > maximum_bytes
        or width > MAXIMUM_DIMENSION or height > MAXIMUM_DIMENSION
        or width > math.maxinteger // height or width * height > MAXIMUM_PIXELS then
        return nil
    end
    local data = body:sub(newline + 1)
    if #data ~= width * height then return nil end
    return {
        kind = "grayscale", width = width, height = height,
        source_bytes = source_bytes, data = data,
    }
end

local function read_materialized(base_path, reference, maximum_bytes, runtime, base_kind)
    local output = request("image_assets/materialize.mjs", "TM-U220 image materializer",
        base_path, reference, maximum_bytes, runtime, base_kind)
    if type(output) ~= "string" then return nil, "READ_FAILED" end
    if output:sub(1, #SUCCESS) == SUCCESS then
        local data = output:sub(#SUCCESS + 1)
        if #data >= 1 and #data <= maximum_bytes then
            return { kind = "bytes", source_bytes = #data, data = data }
        end
        return nil, "READ_FAILED"
    end
    if output:sub(1, #GRAYSCALE) == GRAYSCALE then
        local raster = grayscale_payload(output, maximum_bytes)
        if raster then return raster end
        return nil, "READ_FAILED"
    end
    return nil, failure(output)
end

function M.read_image(document_path, reference, maximum_bytes, runtime)
    return read_materialized(document_path, reference, maximum_bytes, runtime, "document")
end

function M.read_root_image(asset_root, reference, maximum_bytes, runtime)
    return read_materialized(asset_root, reference, maximum_bytes, runtime, "root")
end

return M
