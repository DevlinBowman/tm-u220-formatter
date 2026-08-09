-- Composes the public command catalog used by parsing, validation, dispatch, and focused help.
-- Compatibility groups retain flat names while branch-only catalogs opt out explicitly.
local DeveloperCatalog = require("tm_u220.cli.developer_catalog")

local M = {}

local function options(...)
    local result = {}
    for _, name in ipairs({ ... }) do result[name] = true end
    return result
end

local function input(kind, allowed, fields)
    return { kind = kind, allowed = options(table.unpack(allowed)),
        position = fields and fields.position or 1,
        standard_input = fields and fields.standard_input or false,
        string_input = fields and fields.string_input or false }
end

local AUTHORING = {
    { name = "config", usage = "config",
        summary = "Open editable aliases and the authoring profile in Vim.", arguments = 0,
        options = {}, notes = {
            "Vim opens the directive aliases and authoring profile in separate tabs.",
            "Installed releases seed user-owned copies; managed printer policy is unchanged.",
        } },
    { name = "check", usage = "check [<input>] [options]",
        summary = "Validate a job without emitting printer bytes.", minimum = 0, maximum = 1,
        input = input("job", { "job" }, { standard_input = true, string_input = true }),
        options = options("output", "profile_path", "raw_text", "formatted_text"),
        option_order = { "raw_text", "formatted_text", "profile_path", "output" } },
    { name = "compile", usage = "compile [<input>] [options]",
        summary = "Compile a job to printer bytes or hexadecimal text.", minimum = 0, maximum = 1,
        input = input("job", { "job" }, { standard_input = true, string_input = true }),
        options = options("output", "profile_path", "hex", "raw_text", "formatted_text"),
        option_order = { "raw_text", "formatted_text", "profile_path", "hex", "output" } },
    { name = "preview", usage = "preview <file> [--profile PROFILE]",
        summary = "Open one existing job beside its live graphical receipt.", arguments = 1,
        input = input("job", { "job" }), options = options("profile_path"),
        option_order = { "profile_path" } },
    { name = "render", usage = "render [<input>] [options]",
        summary = "Render the formatter's receipt plan without printing.", minimum = 0, maximum = 1,
        input = input("job", { "job" }, { standard_input = true, string_input = true }),
        options = options("output", "profile_path", "json", "raw_text", "formatted_text"),
        option_order = { "raw_text", "formatted_text", "profile_path", "json", "output" } },
    { name = "inspect", usage = "inspect <input> [options]",
        summary = "Parse an authored job, raw byte stream, or hexadecimal stream.", arguments = 1,
        input = input("infer", { "job", "raw", "hex" }),
        options = options("output", "input_kind", "profile_path", "json"),
        option_order = { "input_kind", "profile_path", "json", "output" },
        option_overrides = { input_kind = { label = "--input job|raw|hex" } } },
}

local PRINTING = {
    { name = "print", usage = "print [<input>] [options]",
        summary = "Compile and submit a job through LPD, live, or one-shot RAW delivery.",
        minimum = 0, maximum = 1, transport = true,
        input = input("job", { "job" }, { standard_input = true, string_input = true }),
        options = options("profile_path", "transport", "host", "port", "queue", "timeout",
            "source_port", "source_ports_text", "raw_text", "formatted_text", "verbose",
            "live", "silent", "sudo", "legacy_source_ports"),
        option_order = { "raw_text", "formatted_text", "profile_path", "live", "silent",
            "transport", "host", "port", "timeout", "source_port", "source_ports_text",
            "legacy_source_ports", "sudo", "verbose", "queue" },
        legacy_options = { queue = "--queue is a legacy option; the installed LPD queue is fixed" },
        notes = {
            "Default delivery submits one whole job through the installed LPD policy.",
            "--live mirrors confirmed lines and permits cancellation; --silent requires --live.",
            "--transport raw-tcp is an advanced one-shot route and requires --host.",
            "Installed LPD and live endpoints cannot be overridden from the command line.",
        } },
    { name = "setup-printing", usage = "setup-printing [--host IPV4] [--profile default|FILE]",
        summary = "Review and install the local printer connection policy.", arguments = 0,
        setup_options = true,
        options = options("host", "profile_path"), option_order = { "host", "profile_path" },
        option_overrides = {
            host = { label = "--host IPV4",
                description = "Select a canonical private or IPv4 link-local printer address." },
            profile_path = { label = "--profile default|FILE",
                description = "Select the included profile or an explicit profile file." },
        },
        notes = { "A bare command opens the guided macOS selection assistant.",
            "An explicit host must be a canonical private or IPv4 link-local address." } },
    { name = "printing-status", usage = "printing-status [options]",
        summary = "Inspect the installed printing policy and optional device readiness.", arguments = 0,
        options = options("json", "check_device"), option_order = { "check_device", "json" },
        notes = { "The default audit performs no device I/O; --check-device opts in." } },
    { name = "remove-printing", usage = "remove-printing [--remove] [--json]",
        summary = "Preview or perform removal of the installed printing policy.", arguments = 0,
        options = options("json", "remove"), option_order = { "remove", "json" },
        notes = { "The default command is a read-only plan; only --remove mutates policy." } },
}

local REFERENCE = {
    { name = "directives", usage = "directives",
        summary = "List every valid directive and shipped alias directly.", arguments = 0,
        options = {}, notes = { "Run '220 rules directives' for detailed behavior." } },
    { name = "profile-queries", usage = "profile-queries [--json] [-o FILE]",
        summary = "List supported printer-profile query requests.", arguments = 0,
        options = options("output", "json"), option_order = { "json", "output" } },
    { name = "profile-decode", usage = "profile-decode <query-id> <response-file> [options]",
        summary = "Decode one raw or hexadecimal settings-query response.", arguments = 2,
        profile_query = true,
        input = input("hex", { "raw", "hex" }, { position = 2 }),
        fields = { query_id = 1 }, options = options("output", "input_kind", "json"),
        option_order = { "input_kind", "json", "output" }, input_kind_label = "raw or hex",
        option_overrides = { input_kind = { label = "--input raw|hex",
            description = "Interpret the response file as raw bytes or hexadecimal text." } } },
    { name = "rules", usage = "rules [topic]",
        summary = "Browse formatting rules and examples.", minimum = 0, maximum = 1,
        fields = { topic = 1 }, options = {} },
    { name = "help", usage = "help [command-path]",
        summary = "Show the overview or focused command help.", minimum = 0, maximum = 2,
        options = {} },
    { name = "version", usage = "version",
        summary = "Show the installed application version.", arguments = 0, options = {} },
}

local SECTIONS = {
    { name = "Authoring", commands = AUTHORING },
    { name = "Printing", commands = PRINTING },
    { name = "Reference", commands = REFERENCE },
}
local DEFINITIONS, ORDER = {}, {}

local function register(definition, section)
    assert(not DEFINITIONS[definition.name], "duplicate CLI command " .. definition.name)
    definition.section = section
    definition.aliases = {}
    DEFINITIONS[definition.name] = definition
    ORDER[#ORDER + 1] = definition.name
end

for _, section in ipairs(SECTIONS) do
    for _, definition in ipairs(section.commands) do
        register(definition, section.name)
    end
end
for _, definition in ipairs(DeveloperCatalog.definitions) do register(definition) end

local GROUPS = {
    printer = { summary = "Printing-policy lifecycle commands", order = {
        { "setup", "setup-printing" }, { "status", "printing-status" },
        { "deauthorize", "remove-printing" },
    } },
    profile = { summary = "Printer-profile discovery commands", order = {
        { "queries", "profile-queries" }, { "decode", "profile-decode" },
    } },
    dev = DeveloperCatalog.group,
}
local GROUP_ORDER = { "printer", "profile", "dev" }
for _, group_name in ipairs(GROUP_ORDER) do
    local group = GROUPS[group_name]
    group.name, group.commands = group_name, {}
    for _, entry in ipairs(group.order) do
        group.commands[entry[1]] = entry[2]
        local alias = group_name .. " " .. entry[1]
        DEFINITIONS[entry[2]].aliases[#DEFINITIONS[entry[2]].aliases + 1] = alias
    end
end

M.definitions, M.sections, M.order = DEFINITIONS, SECTIONS, ORDER
M.groups, M.group_order = GROUPS, GROUP_ORDER

function M.get(name) return DEFINITIONS[name] end
function M.get_group(name) return GROUPS[name] end

function M.resolve(argv, index)
    index = index or 1
    local name = argv[index]
    if DEFINITIONS[name] and DEFINITIONS[name].flat ~= false then
        return DEFINITIONS[name], 1, name
    end
    local group = GROUPS[name]
    if not group then return nil, nil, nil, "unknown command: " .. tostring(name) end
    local subcommand = argv[index + 1]
    local canonical = subcommand and group.commands[subcommand] or nil
    if canonical then return DEFINITIONS[canonical], 2, name .. " " .. subcommand end
    if subcommand == nil then
        return nil, nil, name, name .. " command required"
    end
    return nil, nil, name, "unknown " .. name .. " command: " .. tostring(subcommand)
end

function M.resolve_help(topic)
    if topic == nil or topic == "" then return nil end
    if DEFINITIONS[topic] and DEFINITIONS[topic].flat ~= false then
        return { command = DEFINITIONS[topic], path = topic }
    end
    if GROUPS[topic] then return { group = GROUPS[topic], path = topic } end
    local first, second = topic:match("^(%S+)%s+(%S+)$")
    local canonical = first and GROUPS[first] and GROUPS[first].commands[second] or nil
    if canonical then return { command = DEFINITIONS[canonical], path = topic } end
    return nil
end

function M.accepts_option(definition, name)
    return definition.options and definition.options[name] == true
end

function M.accepts_count(definition, count)
    local minimum = definition.minimum or definition.arguments
    local maximum = definition.maximum or definition.arguments
    return count >= minimum and count <= maximum
end

function M.argument_error(name, definition)
    if definition.minimum ~= nil and definition.maximum ~= definition.minimum then
        local noun = definition.name == "rules" and "topic" or "input"
        if definition.name == "help" then noun = "command path" end
        return name .. " expects zero or one " .. noun
    end
    local count = definition.arguments
    return string.format("%s expects %d argument%s", name, count, count == 1 and "" or "s")
end

return M
