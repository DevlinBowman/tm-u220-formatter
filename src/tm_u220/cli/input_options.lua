-- Normalizes positional, standard-input, and explicit-string sources from command descriptors.
-- It also enforces each command's accepted input-kind vocabulary after arity validation.
local Commands = require("tm_u220.cli.commands")

local M = {}

local function string_commands()
    local names = {}
    for _, name in ipairs(Commands.order) do
        local definition = Commands.get(name)
        if definition.input and definition.input.string_input then names[#names + 1] = name end
    end
    return table.concat(names, ", ")
end

local function normalize_string(result, definition)
    local options = result.options
    if options.raw_text and options.formatted_text then return nil, "use --text or --ftext, not both" end
    local kind = options.raw_text and "raw" or (options.formatted_text and "formatted" or nil)
    if kind == nil then return result end
    if not definition.input or not definition.input.string_input then
        local option = kind == "raw" and "--text" or "--ftext"
        return nil, option .. " is accepted only with " .. string_commands()
    end
    if #result.arguments > 0 then
        return nil, "use a positional input, --text, or --ftext; choose exactly one"
    end
    result.input = options.raw_text or options.formatted_text
    options.raw_text, options.formatted_text, options.string_input = nil, nil, kind
    return result
end

function M.prepare(result, definition)
    local err
    result, err = normalize_string(result, definition)
    if not result then return nil, err end
    local input = definition.input
    if input and input.standard_input and result.input == nil and #result.arguments == 0 then
        result.input = "-"
        result.implicit_stdin = true
    end
    return result
end

local function inferred_kind(definition, path)
    if definition.kind ~= "infer" then return definition.kind end
    local lowered = path and path:lower() or ""
    if lowered:match("%.u220$") then return "job" end
    if lowered:match("%.hex$") then return "hex" end
    return "raw"
end

function M.assign_and_validate(result, definition)
    local input = definition.input
    if not input then return result end
    if result.input == nil then result.input = result.arguments[input.position] end
    if result.input == "-" and result.options.string_input == nil and not input.standard_input then
        return nil, "standard input is not supported; pass a file"
    end
    local kind = result.options.input_kind or inferred_kind(input, result.input)
    if not input.allowed[kind] then
        local choices = definition.input_kind_label or "job, raw, or hex"
        return nil, "--input for " .. result.command_path .. " must be " .. choices
    end
    result.options.input_kind = kind
    return result
end

return M
