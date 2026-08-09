-- Parses public command paths and options against the composed CLI catalog.
-- Command-specific print policy is delegated after generic arity and input validation.
local Commands = require("tm_u220.cli.commands")
local InputOptions = require("tm_u220.cli.input_options")
local Options = require("tm_u220.cli.options")
local PrintOptions = require("tm_u220.cli.print_options")
local ProfileOptions = require("tm_u220.cli.profile_options")
local SetupOptions = require("tm_u220.cli.setup_options")

local M = {}

local function option_name(definition)
    return definition.primary or definition.tokens[#definition.tokens]
end

local function take_value(argv, index, definition)
    local value = argv[index + 1]
    if value == nil then return nil, nil, option_name(definition) .. " requires a value" end
    if value == "--" then
        value = argv[index + 2]
        if value == nil then return nil, nil, option_name(definition) .. " requires a value" end
        return value, index + 3
    end
    if Options.from_token(value) then
        return nil, nil, option_name(definition) .. " requires a value"
    end
    return value, index + 2
end

local function parse_tokens(argv, index, result)
    local positional_only = false
    while index <= #argv do
        local token = argv[index]
        if positional_only then
            result.arguments[#result.arguments + 1] = token
            index = index + 1
        elseif token == "--" then
            positional_only = true
            index = index + 1
        else
            local definition = Options.from_token(token)
            if definition then
                local name = definition.name
                if result.options[name] ~= nil then return nil, "duplicate option: " .. token end
                if definition.takes_value then
                    local value, next_index, err = take_value(argv, index, definition)
                    if not value then return nil, err end
                    result.options[name], index = value, next_index
                else
                    result.options[name], index = true, index + 1
                end
            elseif token:sub(1, 1) == "-" and token ~= "-" then
                return nil, "unknown option: " .. token
            else
                result.arguments[#result.arguments + 1] = token
                index = index + 1
            end
        end
    end
    return result
end

local function non_meta_count(options)
    local count = 0
    for name in pairs(options) do
        local definition = Options.get(name)
        if not definition or not definition.meta then count = count + 1 end
    end
    return count
end

local function normalize_meta(result, definition)
    local options = result.options
    if options.help and options.version then return nil, "use --help or --version, not both" end
    if options.version then return nil, "--version is accepted only before a command" end
    if options.help then
        if #result.arguments > 0 or non_meta_count(options) > 0 then
            return nil, "--help cannot be combined with command arguments or options"
        end
        return { command = "help", topic = definition.name == "help"
            and nil or result.command_path, options = {}, arguments = {} }
    end
    return result
end

local function validate_options(result, definition)
    for name in pairs(result.options) do
        local option = Options.get(name)
        if definition.legacy_options and definition.legacy_options[name] then
            return nil, definition.legacy_options[name]
        end
        if not Commands.accepts_option(definition, name) then
            return nil, string.format("%s is not accepted with %s",
                option and option_name(option) or ("--" .. name:gsub("_", "-")),
                result.command_path)
        end
    end
    return result
end

local function map_arguments(result, definition)
    for field, position in pairs(definition.fields or {}) do
        result[field] = result.arguments[position]
    end
    if definition.name == "help" then result.topic = table.concat(result.arguments, " ") end
end

local function initial_command(argv)
    local first = argv[1]
    if first == nil then return Commands.get("help"), 0, "help" end
    local root_help = first == "--help" or first == "-h"
    local root_version = first == "--version"
    if root_help or root_version then
        if #argv > 1 then
            local second = argv[2]
            local second_help = second == "--help" or second == "-h"
            if (root_help and second == "--version") or (root_version and second_help) then
                return nil, nil, nil, "use --help or --version, not both"
            end
            if (root_help and second_help) or (root_version and second == "--version") then
                return nil, nil, nil, "duplicate option: " .. second
            end
            local name = root_help and "--help" or "--version"
            return nil, nil, nil,
                name .. " cannot be combined with command arguments or options"
        end
        local name = root_help and "help" or "version"
        return Commands.get(name), 1, name
    end
    local group = Commands.get_group(first)
    if group and (argv[2] == "--help" or argv[2] == "-h") and #argv == 2 then
        return Commands.get("help"), 2, "help", nil, first
    end
    return Commands.resolve(argv, 1)
end

function M.parse(argv)
    argv = argv or {}
    local definition, consumed, path, resolve_error, group_help = initial_command(argv)
    if not definition then return nil, resolve_error end
    local result = { command = definition.name, command_path = path,
        options = {}, arguments = {} }
    if group_help then return { command = "help", topic = group_help,
        options = {}, arguments = {} } end
    local parsed, err = parse_tokens(argv, consumed + 1, result)
    if not parsed then return nil, err end
    result, err = normalize_meta(result, definition)
    if not result then return nil, err end
    if result.command ~= definition.name then return result end
    result, err = validate_options(result, definition)
    if not result then return nil, err end
    result, err = InputOptions.prepare(result, definition)
    if not result then return nil, err end
    local count = #result.arguments + (result.input ~= nil and 1 or 0)
    if not Commands.accepts_count(definition, count) then
        return nil, Commands.argument_error(path, definition)
    end
    map_arguments(result, definition)
    if definition.profile_query then
        result, err = ProfileOptions.validate(result)
        if not result then return nil, err end
    end
    result, err = InputOptions.assign_and_validate(result, definition)
    if not result then return nil, err end
    if definition.setup_options then
        result, err = SetupOptions.validate(result)
        if not result then return nil, err end
    end
    if definition.transport then return PrintOptions.normalize(result) end
    return result
end

return M
