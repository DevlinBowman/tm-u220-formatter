-- Parses image-profile drafts and optionally compiles one fixed direct image for live preview.
-- Output is bounded to canonical metadata and physical geometry; printer bytes and transport stay private.
local script = (arg and arg[0] or ""):gsub("\\", "/")
local suffix = "/libexec/image_profile_editor/worker.lua"
local root
if script:sub(-#suffix) == suffix then
    root = script:sub(1, #script - #suffix)
elseif script == "libexec/image_profile_editor/worker.lua" then
    root = "."
else
    io.stderr:write("cannot locate project root from image-profile worker path\n")
    os.exit(1)
end
if root == "" then root = "/" end

package.path = root .. "/src/?.lua;" .. root .. "/src/?/init.lua;"
    .. package.path

local Diagnostics = require("tm_u220.core.diagnostics")
local ImageProfile = require("tm_u220.printhead.image_profile")
local Jobs = require("tm_u220.app.job_service")
local Json = require("tm_u220.core.json")

local function argument_error(message)
    error(message, 0)
end

local function command_options(argv)
    local mode = argv[1]
    if mode == "inspect" then
        if #argv ~= 1 then argument_error("inspect accepts no options") end
        return { mode = mode }
    end
    if mode ~= "compile" then
        argument_error("worker command must be inspect or compile")
    end
    local options, index = { mode = mode }, 2
    while index <= #argv do
        local token, value = argv[index], argv[index + 1]
        local key = token == "--image" and "image"
            or token == "--profile" and "profile" or nil
        if not key then argument_error("unknown compile option: " .. tostring(token)) end
        if options[key] then argument_error("duplicate compile option: " .. token) end
        if value == nil then argument_error(token .. " requires a value") end
        options[key], index = value, index + 2
    end
    if not options.image or not options.profile then
        argument_error("compile requires --image PATH and --profile PATH")
    end
    return options
end

local function emit(entries)
    local parts = { "{" }
    for index, entry in ipairs(entries) do
        if index > 1 then parts[#parts + 1] = "," end
        parts[#parts + 1] = Json.encode(entry[1]) .. ":"
        parts[#parts + 1] = entry[2] == nil and "null" or Json.encode(entry[2])
    end
    parts[#parts + 1] = "}\n"
    io.write(table.concat(parts))
end

local function inspect(source)
    local parsed = ImageProfile.parse(source)
    if not parsed.profile or Diagnostics.has_errors(parsed.diagnostics) then
        return nil, nil, parsed.diagnostics
    end
    return assert(ImageProfile.serialize(parsed.profile)),
        assert(ImageProfile.options(parsed.profile)), parsed.diagnostics
end

local function inspect_command(source)
    local canonical, options, diagnostics = inspect(source)
    emit {
        { "valid", canonical ~= nil },
        { "profile_source", canonical },
        { "image_profile", options },
        { "schema", ImageProfile.schema() },
        { "diagnostics", diagnostics },
    }
end

local function compile_command(source, configured)
    local canonical, options, profile_diagnostics = inspect(source)
    if not canonical then
        emit {
            { "valid", false }, { "byte_count", 0 }, { "profile", nil },
            { "lines", {} }, { "paper_preview", nil }, { "finish", nil },
            { "diagnostics", profile_diagnostics }, { "normalization", nil },
            { "input_kind", nil }, { "source_line_offset", 0 },
            { "profile_source", nil }, { "image_profile", nil },
            { "schema", ImageProfile.schema() },
        }
        return
    end
    local result = Jobs.compile_input(configured.image, {
        profile_path = configured.profile,
        image_profile = assert(ImageProfile.new(options)),
    })
    emit {
        { "valid", result.bytes ~= nil },
        { "byte_count", result.bytes and #result.bytes or 0 },
        { "profile", result.profile },
        { "lines", result.preview_lines or {} },
        { "paper_preview", result.paper_preview },
        { "finish", result.finish },
        { "diagnostics", result.diagnostics or {} },
        { "normalization", result.normalization },
        { "input_kind", result.input_kind },
        { "source_line_offset", result.source_line_offset or 0 },
        { "profile_source", canonical },
        { "image_profile", options },
        { "schema", ImageProfile.schema() },
    }
end

local parsed_ok, configured = pcall(command_options, arg or {})
if not parsed_ok then
    io.stderr:write(tostring(configured), "\n")
    os.exit(64)
end

local source = io.read("*a") or ""
local ok, failure = pcall(function()
    if configured.mode == "inspect" then inspect_command(source)
    else compile_command(source, configured) end
end)
if not ok then
    io.stderr:write(tostring(failure), "\n")
    os.exit(1)
end
