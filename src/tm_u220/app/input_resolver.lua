-- Resolves file and inline inputs into validated Unicode interpreted or plain source.
local Diagnostics = require("tm_u220.core.diagnostics")
local Defaults = require("tm_u220.app.local_defaults")
local DocumentText = require("tm_u220.core.document_text")
local Fs = require("tm_u220.core.fs")
local ImageInput = require("tm_u220.app.image_input")
local StringInput = require("tm_u220.app.string_input")

local M = {}
local HEADER = "!tm-u220 job 1"
local IMAGE_PREFIX_BYTES = 8

local function failure(code, message)
    return Diagnostics.new(code, message)
end

local function looks_like_job_path(value)
    if value == "-" then return true end
    if value:find("\0", 1, true) or value:find("\n", 1, true)
        or value:find("\r", 1, true) then
        return false
    end
    return value:lower():sub(-5) == ".u220"
end

local function looks_like_path(value)
    if value:sub(1, 1) == "/" or value:sub(1, 2) == "./"
        or value:sub(1, 3) == "../" or value:sub(1, 2) == "~/" then
        return true
    end
    if value:match("^@[a-z][a-z%-]*%s") or value:sub(1, 2) == "@@" then
        return false
    end
    local has_backslash = value:find("\\", 1, true) ~= nil
    if value:match("^%a:[/\\]") or value:sub(1, 2) == "\\\\" then
        return true
    end
    if value:find("/", 1, true) then return true end
    if not value:find("[\r\n]") and value:match("^.+%.[%w_-]+$") then
        return true
    end
    if value:find("%s") then return false end
    return has_backslash
end

local function normalize_newlines(value)
    return value:gsub("\r\n", "\n"):gsub("\r", "\n")
end

local function normalize_content(value)
    if type(value) ~= "string" then
        return nil, failure("INPUT_INVALID", "document content must be a string")
    end
    if value:find("\0", 1, true) then
        return nil, failure("INPUT_INVALID", "document content cannot contain a NUL byte")
    end
    local normalized, normalization, utf8_failure = DocumentText.normalize(value)
    if not normalized then
        return nil, failure("INPUT_INVALID_UTF8", utf8_failure.message)
    end
    return normalize_newlines(normalized), nil, normalization
end

local function has_header(value)
    for line in (value .. "\n"):gmatch("(.-)\n") do
        if line:sub(1, 1) ~= "#" then return line == HEADER end
    end
    return false
end

function M.prepare_interpreted(value)
    local normalized, content_failure, normalization = normalize_content(value)
    if not normalized then return nil, content_failure end
    local authored_header = has_header(normalized)
    local source = authored_header and normalized
        or HEADER .. "\n" .. normalized
    return source, nil, normalization, { inserted_header = not authored_header }
end

function M.prepare_plain(value)
    return normalize_content(value)
end

local function resolve_content(content, path, mode, options)
    local prepare = mode == "plain" and M.prepare_plain or M.prepare_interpreted
    local source, content_failure, normalization = prepare(content)
    if not source then return nil, content_failure end
    return {
        input_kind = mode,
        path = path,
        content = content,
        source = source,
        profile_path = options.profile_path or Defaults.profile_path(),
        normalization = normalization,
    }
end

local function resolved_image(value, image_format, options)
    return {
        input_kind = "image",
        image_format = image_format,
        image_reference = ImageInput.reference(value),
        path = value,
        profile_path = options.profile_path or Defaults.profile_path(),
    }
end

local function unreadable_path(value, read_error)
    local code = looks_like_job_path(value)
        and "INPUT_JOB_READ_FAILED" or "INPUT_FILE_READ_FAILED"
    local hint = value:sub(1, 2) == "~/"
        and '; use an unquoted ~ or "$HOME/..." for your home directory'
        or ""
    return failure(code,
        "cannot use input file " .. value .. ": " .. tostring(read_error) .. hint)
end

function M.resolve(value, options)
    options = options or {}
    if type(value) ~= "string" then
        return nil, failure("INPUT_INVALID", "input must be a string")
    end
    if value:find("\0", 1, true) then
        return nil, failure("INPUT_INVALID", "input cannot contain a NUL byte")
    end
    local mode, explicit, mode_error = StringInput.resolve(options)
    if not mode then return nil, failure("INPUT_STRING_TYPE_INVALID", mode_error) end
    if explicit then return resolve_content(value, nil, mode, options) end

    local filesystem = options.fs or Fs
    local content, read_error
    if value ~= "-" then
        local prefix
        prefix, read_error = filesystem.read_prefix(value, IMAGE_PREFIX_BYTES)
        if prefix ~= nil then
            local image_format = ImageInput.detect(prefix)
            if image_format then return resolved_image(value, image_format, options) end
            content, read_error = filesystem.read(value, true)
            if content == nil then return nil, unreadable_path(value, read_error) end
        end
    else
        content, read_error = filesystem.read(value, true)
    end
    if content ~= nil then
        return resolve_content(content, value, mode, options)
    end
    if looks_like_path(value) then
        return nil, unreadable_path(value, read_error)
    end
    return resolve_content(value, nil, mode, options)
end

return M
