-- Orchestrates parsed job operations across formatter feature sessions and ESC/POS encoding.
-- Feature-specific layout state stays in its owning module and is only wired together here.
local diagnostics = require("tm_u220.core.diagnostics")
local Context = require("tm_u220.format.context")
local layout = require("tm_u220.format.layout")
local commands = require("tm_u220.app.job_commands")
local finish = require("tm_u220.app.job_finish")
local profile_api = require("tm_u220.spec.profile")
local state_api = require("tm_u220.format.state")
local TabularSession = require("tm_u220.format.tabular.session")

local M = {}

local function copy_items(values)
    local out = {}
    for index, value in ipairs(values or {}) do out[index] = value end
    return out
end

local function has_values(value)
    return type(value) == "table" and next(value) ~= nil
end

local function resolve_profile(document, supplied, found)
    local authored = document.profile
    if not supplied and not has_values(authored) then
        found[#found + 1] = diagnostics.new(
            "FORMAT_PROFILE_REQUIRED",
            "an explicit TM-U220 profile is required before compiling"
        )
        return nil
    end

    local options = supplied or authored
    local profile, err = profile_api.new(options)
    if not profile then
        found[#found + 1] = diagnostics.new(
            "FORMAT_PROFILE_INVALID",
            err,
            options.span
        )
        return nil
    end

    if supplied and has_values(authored) then
        local declared, declared_err = profile_api.new(authored)
        if not declared then
            found[#found + 1] = diagnostics.new(
                "FORMAT_PROFILE_INVALID", declared_err, authored.span)
            return nil
        end
        if declared.id ~= profile.id or declared.cutter ~= profile.cutter then
            found[#found + 1] = diagnostics.new(
                "FORMAT_PROFILE_CONFLICT",
                "job @profile does not match the supplied saved printer profile",
                authored.span
            )
            return nil
        end
    end
    return profile
end

local function compile_operation(context, tables, operation)
    if tables:handle(context, operation) then
        return
    end
    if not tables:allows_operation(context, operation) then
        return
    end

    if operation.kind == "text" or operation.kind == "text_line" then
        context:text(operation.text, operation.span)
        if operation.kind == "text_line" then
            context:line_feed("text_line", operation.span)
        end
    elseif operation.kind == "rule" then
        layout.rule(context, operation)
    elseif operation.kind == "kv" then
        layout.key_value(context, operation)
    elseif operation.kind == "finish" then
        finish.handle(context, operation)
    elseif not commands.handle(context, operation) then
        context:add_diagnostic(
            "FORMAT_UNKNOWN_OPERATION",
            "unsupported job operation " .. tostring(operation.kind),
            operation.span
        )
    end
end

function M.compile(document, options)
    options = options or {}
    if type(document) ~= "table" then
        return {
            diagnostics = {
                diagnostics.new("FORMAT_INVALID_DOCUMENT", "document must be a table"),
            },
        }
    end

    local found = copy_items(document.diagnostics)
    if diagnostics.has_errors(found) then return { diagnostics = found } end
    local profile = resolve_profile(document, options.profile, found)
    if not profile then return { diagnostics = found } end

    for _, item in ipairs(finish.validate(document.ops)) do
        found[#found + 1] = item
    end
    if diagnostics.has_errors(found) then
        return { profile = profile, diagnostics = found }
    end

    local context = Context.new(profile)
    local tables = TabularSession.new()
    context:command("control.initialize")
    for _, operation in ipairs(document.ops or {}) do
        compile_operation(context, tables, operation)
    end
    tables:finish(context)
    if not state_api.at_beginning(context.state) then
        context:line_feed("end_of_job")
    end
    for _, item in ipairs(context.diagnostics) do found[#found + 1] = item end

    return {
        profile = profile,
        nodes = context.nodes,
        print_boundaries = context.print_boundaries,
        preview_lines = context.preview_lines,
        paper_preview = context:paper_preview(),
        finish = not diagnostics.has_errors(found)
            and finish.describe(document.ops, profile) or nil,
        diagnostics = found,
    }
end

return M
