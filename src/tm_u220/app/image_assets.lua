-- Materializes data-only @image operations from safely read PBM, PNG, or JPEG companions.
-- Path security stays in the fixed reader while canonical rasters stay in printhead modules.
local AssetReader = require("tm_u220.app.image_asset_reader")
local Diagnostics = require("tm_u220.core.diagnostics")
local Grayscale = require("tm_u220.printhead.grayscale")
local Pbm = require("tm_u220.printhead.pbm")

local M = {}
local MAXIMUM_IMAGES = 16
local MAXIMUM_ASSET_BYTES = 1024 * 1024
local MAXIMUM_TOTAL_BYTES = 4 * 1024 * 1024
local MAXIMUM_TOTAL_PIXELS = 4 * 1024 * 1024
local PBM_LIMITS = {
    maximum_width = 4096,
    maximum_height = 4096,
    maximum_pixels = 4 * 1024 * 1024,
    maximum_payload_bytes = MAXIMUM_ASSET_BYTES,
}

local FAILURE_CODES = {
    DOCUMENT_INVALID = "IMAGE_ASSET_BASE_INVALID",
    REFERENCE_INVALID = "IMAGE_ASSET_REFERENCE_INVALID",
    LINK_REJECTED = "IMAGE_ASSET_LINK_REJECTED",
    SIZE_INVALID = "IMAGE_ASSET_SIZE_INVALID",
    FILE_CHANGED = "IMAGE_ASSET_CHANGED",
    PNG_INVALID = "IMAGE_ASSET_INVALID",
    JPEG_INVALID = "IMAGE_ASSET_INVALID",
}

local function copy(values)
    local result = {}
    for key, value in pairs(values or {}) do result[key] = value end
    return result
end

local function diagnostic(code, message, span)
    return Diagnostics.new(code, message, span)
end

local function read_failure_message(failure, path)
    if failure == "PNG_INVALID" then return "cannot decode @image PNG " .. path end
    if failure == "JPEG_INVALID" then return "cannot decode @image JPEG " .. path end
    if failure == "SIZE_INVALID" then
        return string.format("@image asset %s must be between 1 byte and %d MiB",
            path, MAXIMUM_ASSET_BYTES // (1024 * 1024))
    end
    return "cannot safely read @image asset " .. path
end

function M.materialize(document, options)
    options = options or {}
    local result = copy(document)
    result.ops = {}
    result.diagnostics = copy(document.diagnostics)
    local image_count, total_bytes, total_pixels = 0, 0, 0
    local read
    if options.read_asset then
        read = function(...)
            local bytes, failure = options.read_asset(...)
            if not bytes then return nil, failure end
            return { kind = "bytes", source_bytes = #bytes, data = bytes }
        end
    elseif options.document_path then
        read = AssetReader.read_image
    else
        read = AssetReader.read_root_image
    end

    for _, operation in ipairs(document.ops or {}) do
        local enriched = copy(operation)
        result.ops[#result.ops + 1] = enriched
        if operation.kind == "image" then
            image_count = image_count + 1
            if image_count > MAXIMUM_IMAGES then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "IMAGE_ASSET_COUNT_EXCEEDED",
                    string.format("a job may contain at most %d images", MAXIMUM_IMAGES),
                    operation.span)
            elseif not options.document_path and not options.asset_root then
                result.diagnostics[#result.diagnostics + 1] = diagnostic(
                    "IMAGE_ASSET_BASE_REQUIRED",
                    "@image requires a file-backed document or an explicit safe asset base",
                    operation.span)
            else
                local base_path = options.document_path or options.asset_root
                local asset, failure = read(base_path, operation.path,
                    MAXIMUM_ASSET_BYTES, options.reader_runtime)
                if not asset then
                    result.diagnostics[#result.diagnostics + 1] = diagnostic(
                        FAILURE_CODES[failure] or "IMAGE_ASSET_READ_FAILED",
                        read_failure_message(failure, operation.path),
                        operation.span)
                elseif total_bytes + asset.source_bytes > MAXIMUM_TOTAL_BYTES then
                    result.diagnostics[#result.diagnostics + 1] = diagnostic(
                        "IMAGE_ASSET_TOTAL_SIZE_EXCEEDED",
                        "combined @image source bytes exceed the per-job limit",
                        operation.span)
                else
                    total_bytes = total_bytes + asset.source_bytes
                    local raster, image_format, decode_failure
                    if asset.kind == "grayscale" then
                        raster, decode_failure = Grayscale.new({
                            width = asset.width, height = asset.height, data = asset.data,
                        })
                        image_format = asset.image_format
                    elseif asset.kind == "bytes" then
                        raster, decode_failure = Pbm.decode(asset.data, PBM_LIMITS)
                        image_format = "pbm"
                    else
                        decode_failure = "image reader returned an unsupported raster kind"
                    end
                    if not raster then
                        result.diagnostics[#result.diagnostics + 1] = diagnostic(
                            "IMAGE_ASSET_INVALID",
                            operation.path .. ": " .. decode_failure,
                            operation.span)
                    elseif total_pixels + raster.width * raster.height
                        > MAXIMUM_TOTAL_PIXELS then
                        result.diagnostics[#result.diagnostics + 1] = diagnostic(
                            "IMAGE_ASSET_TOTAL_PIXELS_EXCEEDED",
                            "combined @image source pixels exceed the per-job limit",
                            operation.span)
                    else
                        total_pixels = total_pixels + raster.width * raster.height
                        enriched.source_raster = raster
                        enriched.image_format = image_format
                    end
                end
            end
        end
    end
    return result
end

return M
