-- Defines public option spellings and descriptions once for parsing and focused help.
-- Command descriptors decide which members of this catalog they accept.
local M = {}

local DEFINITIONS = {
    output = { tokens = { "-o", "--output" }, value = "FILE",
        description = "Write command output to FILE instead of standard output." },
    input_kind = { tokens = { "--input" }, value = "KIND",
        description = "Interpret input as job, raw bytes, or hexadecimal text." },
    profile_path = { tokens = { "--profile" }, value = "PROFILE",
        description = "Use the selected saved printer profile." },
    transport = { tokens = { "--transport" }, value = "MODE",
        description = "Select lpd or raw-tcp delivery." },
    host = { tokens = { "--host" }, value = "HOST",
        description = "Use the selected printer host where the command permits it." },
    port = { tokens = { "--port" }, value = "PORT",
        description = "Use destination port 1 through 65535." },
    queue = { tokens = { "--queue" }, value = "QUEUE", legacy = true,
        description = "Legacy spelling; installed LPD queue policy cannot be overridden." },
    timeout = { tokens = { "--timeout" }, value = "SECONDS",
        description = "Set the operation timeout in seconds." },
    source_port = { tokens = { "--source-port" }, value = "PORT",
        description = "Bind one explicit local source port for one-shot RAW." },
    source_ports_text = { tokens = { "--source-ports" }, value = "P1,P2",
        description = "Try explicit RAW source ports after confirmed bind collisions." },
    raw_text = { tokens = { "--text" }, value = "TEXT",
        description = "Use literal plain text without interpreting directives." },
    formatted_text = { tokens = { "--ftext", "--formatted-text" }, primary = "--ftext",
        value = "FTEXT",
        description = "Interpret an explicit string exactly like file content." },
    hex = { tokens = { "--hex" }, description = "Render compiled bytes as hexadecimal text." },
    json = { tokens = { "--json" }, description = "Render machine-readable JSON." },
    verbose = { tokens = { "--verbose" }, description = "Report submission details." },
    live = { tokens = { "--live" }, description = "Use confirmed, cancellable live delivery." },
    silent = { tokens = { "--silent" }, description = "Hide mirrored lines during live delivery." },
    sudo = { tokens = { "--sudo" }, description = "Elevate an explicit privileged RAW source port." },
    legacy_source_ports = { tokens = { "--legacy-source-ports" },
        description = "Try legacy RAW source ports 1023 through 1016." },
    check_device = { tokens = { "--check-device" },
        description = "Contact the configured printer through the installed bypass." },
    remove = { tokens = { "--remove" },
        description = "Perform the reviewed removal plan instead of a dry run." },
    help = { tokens = { "-h", "--help" }, meta = true,
        description = "Show focused command help." },
    version = { tokens = { "--version" }, meta = true,
        description = "Show the installed application version." },
}

local BY_TOKEN = {}
for name, definition in pairs(DEFINITIONS) do
    definition.name = name
    definition.takes_value = definition.value ~= nil
    for _, token in ipairs(definition.tokens) do BY_TOKEN[token] = definition end
end

M.definitions = DEFINITIONS

function M.get(name)
    return DEFINITIONS[name]
end

function M.from_token(token)
    return BY_TOKEN[token]
end

function M.help_label(name)
    local definition = assert(DEFINITIONS[name], "unknown CLI option " .. tostring(name))
    local labels = {}
    for _, token in ipairs(definition.tokens) do
        labels[#labels + 1] = token .. (definition.value and " " .. definition.value or "")
    end
    return table.concat(labels, ", ")
end

return M
