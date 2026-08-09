-- Orchestrates source loading, normalization, job compilation, and byte encoding.
local diagnostics = require("tm_u220.core.diagnostics")
local encoder = require("tm_u220.escpos.encoder")
local fs = require("tm_u220.core.fs")
local image_input = require("tm_u220.app.image_input")
local input_resolver = require("tm_u220.app.input_resolver")
local image_assets = require("tm_u220.app.image_assets")
local job = require("tm_u220.job")
local compiler = require("tm_u220.app.job_compiler")
local local_defaults = require("tm_u220.app.local_defaults")
local plain_document = require("tm_u220.job.plain_document")
local profile_file = require("tm_u220.profile.file")
local image_profile_api = require("tm_u220.printhead.image_profile")
local string_input = require("tm_u220.app.string_input")

local M = {}

local function with_normalization(result, summary)
    if summary and summary.bom and summary.bom > 0 then
        result.normalization = summary
    end
    return result
end

local function read_source(path)
    local source, err = fs.read(path, false)
    if not source then
        return nil, diagnostics.new("INPUT_READ_FAILED", err)
    end
    return source
end

function M.load(path, options)
    options = options or {}
    local source, failure = read_source(path)
    if not source then
        return { diagnostics = { failure } }
    end
    local document = job.parse(source, { alias_path = options.alias_path })
    return { source = source, document = document, diagnostics = document.diagnostics }
end

local function resolve_saved_profile(options)
    local profile = options.profile
    if not options.profile_path then return profile end

    local source, err = fs.read(options.profile_path, false)
    if not source then
        return nil, { diagnostics.new("PROFILE_FILE_READ_FAILED", err) }
    end
    local parsed = profile_file.parse(source)
    if diagnostics.has_errors(parsed.diagnostics) then
        return nil, parsed.diagnostics
    end
    return parsed.options
end

local function resolve_image_profile(options)
    if options.image_profile then
        if image_profile_api.is(options.image_profile) then return options.image_profile end
        local profile, err = image_profile_api.new(options.image_profile)
        if profile then return profile end
        return nil, { diagnostics.new("IMAGE_PROFILE_INVALID", err) }
    end
    if not options.image_profile_path then return image_profile_api.defaults() end
    local source, err = fs.read(options.image_profile_path, false)
    if not source then
        return nil, { diagnostics.new("IMAGE_PROFILE_FILE_READ_FAILED", err) }
    end
    local parsed = image_profile_api.parse(source)
    if diagnostics.has_errors(parsed.diagnostics) then
        return nil, parsed.diagnostics
    end
    return parsed.profile
end

local function compile_document(document, source, options)
    options = options or {}
    local profile, profile_diagnostics = resolve_saved_profile(options)
    if profile_diagnostics then return { diagnostics = profile_diagnostics } end
    local image_profile, image_profile_diagnostics = resolve_image_profile(options)
    if image_profile_diagnostics then return { diagnostics = image_profile_diagnostics } end

    local prepared = document
    if not diagnostics.has_errors(document.diagnostics) then
        prepared = image_assets.materialize(document, {
            document_path = options.document_path,
            asset_root = options.asset_root,
            read_asset = options.read_asset,
            reader_runtime = options.image_asset_reader_runtime,
        })
    end
    local result = compiler.compile(prepared, {
        profile = profile,
        image_profile = image_profile,
    })
    result.image_profile = image_profile
    result.source = source
    result.document = document
    if diagnostics.has_errors(result.diagnostics) then return result end

    local encoded = encoder.encode(result.nodes)
    for _, item in ipairs(encoded.diagnostics) do
        result.diagnostics[#result.diagnostics + 1] = item
    end
    result.bytes = encoded.bytes
    result.encoded_parts = encoded.parts
    return result
end

function M.compile_source(source, options)
    options = options or {}
    return compile_document(job.parse(source, { alias_path = options.alias_path }), source, options)
end

function M.compile_plain(source, options)
    return compile_document(plain_document.parse(source), source, options)
end

function M.compile_content(content, options)
    options = options or {}
    local mode, _, mode_error = string_input.resolve(options)
    if not mode then
        return { diagnostics = {
            diagnostics.new("INPUT_STRING_TYPE_INVALID", mode_error),
        } }
    end
    local plain = mode == "plain"
    local prepare = plain and input_resolver.prepare_plain
        or input_resolver.prepare_interpreted
    local source, failure, normalization, preparation = prepare(content)
    if not source then return { diagnostics = { failure } } end
    local compile = plain and M.compile_plain or M.compile_source
    local result = compile(source, {
        alias_path = options.alias_path,
        profile = options.profile,
        profile_path = options.profile_path
            or (not options.profile and local_defaults.profile_path()),
        image_profile = options.image_profile,
        image_profile_path = options.image_profile_path
            or (not options.image_profile and local_defaults.image_profile_path()),
        document_path = options.document_path,
        asset_root = options.asset_root,
        read_asset = options.read_asset,
        image_asset_reader_runtime = options.image_asset_reader_runtime,
    })
    result.source_line_offset = preparation and preparation.inserted_header and 1 or 0
    return with_normalization(result, normalization)
end

function M.compile(path, options)
    options = options or {}
    local loaded = M.load(path, options)
    if not loaded.document then return loaded end
    local compile_options = {}
    for key, value in pairs(options) do compile_options[key] = value end
    compile_options.document_path = compile_options.document_path or path
    return compile_document(loaded.document, loaded.source, compile_options)
end

local function resolved_options(options, resolved)
    local resolved_document = resolved.path ~= "-" and resolved.path or nil
    return {
        alias_path = options.alias_path,
        profile = options.profile,
        profile_path = options.profile_path or resolved.profile_path
            or local_defaults.profile_path(),
        image_profile = options.image_profile,
        image_profile_path = options.image_profile_path
            or local_defaults.image_profile_path(),
        document_path = options.document_path or resolved_document,
        asset_root = options.asset_root,
        read_asset = options.read_asset,
        image_asset_reader_runtime = options.image_asset_reader_runtime,
    }
end

function M.compile_input(value, options)
    options = options or {}
    local resolved, failure = input_resolver.resolve(value, {
        string_input = options.string_input,
        text = options.text,
        profile_path = options.profile_path,
        image_profile_path = options.image_profile_path,
    })
    if not resolved then return { diagnostics = { failure } } end
    if resolved.input_kind == "image" then
        local document = image_input.document(resolved)
        local result = compile_document(document, "", resolved_options(options, resolved))
        result.input_kind = "image"
        return result
    end
    local source, normalization = resolved.source, resolved.normalization
    local compile = resolved.input_kind == "plain" and M.compile_plain or M.compile_source
    return with_normalization(
        compile(source, resolved_options(options, resolved)), normalization)
end

return M
