-- Implements authored-input commands while delegating all observable output to the CLI adapter.
-- Compilation and rendering stay independent of transport and printing-policy handlers.
local Bytes = require("tm_u220.core.bytes")
local ConfigFiles = require("tm_u220.config.files")
local Diagnostics = require("tm_u220.core.diagnostics")
local EditorLauncher = require("tm_u220.app.editor_launcher")
local InspectRender = require("tm_u220.render.inspect")
local InspectService = require("tm_u220.app.inspect_service")
local Jobs = require("tm_u220.app.job_service")
local Json = require("tm_u220.render.json")
local Preview = require("tm_u220.render.preview")

local M = {}

local function configuration(runtime)
    local files = runtime.config_files or ConfigFiles
    local facts = runtime.config_files_runtime
    local aliases, failure = files.active_path("aliases", facts)
    if not aliases then
        return nil, Diagnostics.new("AUTHORING_CONFIG_PATH_INVALID", failure)
    end
    local profile
    profile, failure = files.active_path("profile", facts)
    if not profile then
        return nil, Diagnostics.new("AUTHORING_CONFIG_PATH_INVALID", failure)
    end
    return {
        aliases = aliases,
        profile = profile,
    }
end

local function compile_result(parsed, runtime)
    local service = runtime.job_service or Jobs
    local config, failure = configuration(runtime)
    if not config then return { diagnostics = { failure } } end
    return service.compile_input(parsed.input, {
        alias_path = config.aliases,
        profile_path = parsed.options.profile_path or config.profile,
        string_input = parsed.options.string_input,
    })
end

local function compilation(parsed, runtime, output, warnings)
    local result = compile_result(parsed, runtime)
    if Diagnostics.has_errors(result.diagnostics) then
        output:diagnostics(result.diagnostics)
        return nil, 1
    end
    if warnings then output:diagnostics(result.diagnostics, true) end
    return result
end

local function check_command(parsed, runtime, output)
    local result, status = compilation(parsed, runtime, output, true)
    if not result then return status end
    local text = string.format("ok: %s, %d operations, %d bytes\n",
        result.profile.id, #(result.document.ops or {}), #result.bytes)
    return output:result(parsed.options.output, text, false)
end

local function compile_command(parsed, runtime, output)
    local result, status = compilation(parsed, runtime, output, true)
    if not result then return status end
    local value = parsed.options.hex and Bytes.to_hex(result.bytes) .. "\n" or result.bytes
    return output:result(parsed.options.output, value, not parsed.options.hex)
end

local function render_command(parsed, runtime, output)
    local result, status = compilation(parsed, runtime, output, false)
    if not result then return status end
    local value = parsed.options.json and Json.render({
        profile = result.profile,
        lines = result.preview_lines,
        paper_preview = result.paper_preview,
        finish = result.finish,
        diagnostics = result.diagnostics,
    }) or Preview.render(result)
    return output:result(parsed.options.output, value, false)
end

local function preview_command(parsed, runtime, output)
    local launcher = runtime.editor_launcher or EditorLauncher
    local config, failure = configuration(runtime)
    if not config then
        output:diagnostics({ failure })
        return 1
    end
    return launcher.run(parsed.input, {
        alias_path = config.aliases,
        string_input = parsed.options.string_input,
        profile_path = parsed.options.profile_path or config.profile,
    }, runtime.editor_runtime)
end

local function inspect_command(parsed, runtime, output)
    local service = runtime.inspect_service or InspectService
    local config, failure = configuration(runtime)
    if not config then
        output:diagnostics({ failure })
        return 1
    end
    local result = service.inspect(parsed.input, {
        alias_path = config.aliases,
        input_kind = parsed.options.input_kind,
        profile_path = parsed.options.profile_path or config.profile,
    })
    if Diagnostics.has_errors(result.diagnostics) then
        output:diagnostics(result.diagnostics)
        return 1
    end
    local value = parsed.options.json and Json.render(result) or InspectRender.render(result)
    return output:result(parsed.options.output, value, false)
end

M.handlers = {
    check = check_command,
    compile = compile_command,
    preview = preview_command,
    render = render_command,
    inspect = inspect_command,
}

return M
