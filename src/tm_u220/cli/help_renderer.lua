-- Renders focused command and command-group help directly from the composed catalog.
-- The overview remains curated prose, while signatures and option lists stay descriptor-backed.
local Commands = require("tm_u220.cli.commands")
local Options = require("tm_u220.cli.options")

local M = {}

local function option_line(definition, name)
    local option = Options.get(name)
    local override = definition.option_overrides and definition.option_overrides[name] or {}
    return string.format("  %-34s %s", override.label or Options.help_label(name),
        override.description or option.description)
end

function M.overview()
    local lines = {
        "220 - format text and print it reliably on the local Epson TM-U220",
        "",
        "Usage:",
        "  220 <command> [options]",
        "  220 help [command-path]",
        "  220 <command> --help",
        "",
        "Common examples:",
        "  220 print receipt.u220             Fast whole-job LPD (default)",
        "  220 print receipt.u220 --live      Mirror confirmed lines; c cancels",
        "  220 check receipt.u220",
        "  220 preview receipt.u220           Open the live browser workspace",
        "  220 render receipt.u220            Render a receipt plan in the terminal",
        "  220 directives                     List valid authoring directives",
        "  220 config                         Edit aliases and profile in Vim",
        "  220 help printer setup",
        "  printf '12345\\n12345\\n@fi' | 220 print",
    }
    for _, section in ipairs(Commands.sections) do
        lines[#lines + 1] = ""
        lines[#lines + 1] = section.name .. " commands:"
        for _, definition in ipairs(section.commands) do
            lines[#lines + 1] = string.format("  %-20s %s",
                definition.name, definition.summary)
        end
    end
    lines[#lines + 1] = ""
    lines[#lines + 1] = "Command groups:"
    for _, name in ipairs(Commands.group_order) do
        local subcommands = {}
        for _, entry in ipairs(Commands.groups[name].order) do
            subcommands[#subcommands + 1] = entry[1]
        end
        lines[#lines + 1] = "  220 " .. name .. " " .. table.concat(subcommands, "|")
    end
    lines[#lines + 1] = ""
    lines[#lines + 1] = "Input:"
    lines[#lines + 1] = "  --text TEXT                       Use a literal string."
    lines[#lines + 1] = "  --ftext FTEXT, --formatted-text FTEXT"
    lines[#lines + 1] = "                                      Interpret an explicit string."
    lines[#lines + 1] = "  Omitted input or - reads interpreted standard input where supported."
    lines[#lines + 1] = "  Both input modes preserve valid Unicode and map resident glyphs through printer code pages."
    lines[#lines + 1] = "  Unavailable glyphs print as ? with a warning; unlocked ASCII returns to the default page."
    lines[#lines + 1] = ""
    lines[#lines + 1] = "Live printing is slower than default LPD; --silent requires --live."
    lines[#lines + 1] = "Run '220 rules' for formatting syntax and '220 help <command-path>' for command details."
    return table.concat(lines, "\n") .. "\n"
end

local function command_help(target)
    local definition = target.command
    local path = definition.flat == false and target.path or definition.name
    local usage = path .. definition.usage:sub(#definition.name + 1)
    local lines = {
        "220 " .. path .. " - " .. definition.summary,
        "",
        "Usage:",
        "  220 " .. usage,
    }
    local aliases = {}
    for _, alias in ipairs(definition.aliases) do
        if alias ~= path then aliases[#aliases + 1] = alias end
    end
    if #aliases > 0 then
        lines[#lines + 1] = ""
        lines[#lines + 1] = "Grouped alias:"
        for _, alias in ipairs(aliases) do
            local suffix = definition.usage:sub(#definition.name + 1)
            lines[#lines + 1] = "  220 " .. alias .. suffix
        end
    end
    lines[#lines + 1] = ""
    lines[#lines + 1] = "Options:"
    local legacy = {}
    for _, name in ipairs(definition.option_order or {}) do
        local option = Options.get(name)
        if option.legacy then legacy[#legacy + 1] = name
        else lines[#lines + 1] = option_line(definition, name) end
    end
    lines[#lines + 1] = string.format("  %-34s %s",
        Options.help_label("help"), Options.get("help").description)
    if #legacy > 0 then
        lines[#lines + 1] = ""
        lines[#lines + 1] = "Legacy (recognized but rejected):"
        for _, name in ipairs(legacy) do lines[#lines + 1] = option_line(definition, name) end
    end
    if definition.notes and #definition.notes > 0 then
        lines[#lines + 1] = ""
        lines[#lines + 1] = "Notes:"
        for _, note in ipairs(definition.notes) do lines[#lines + 1] = "  " .. note end
    end
    if definition.input then
        lines[#lines + 1] = ""
        lines[#lines + 1] = "Use -- before a positional value that begins with -."
    end
    return table.concat(lines, "\n") .. "\n"
end

local function group_help(target)
    local group = target.group
    local lines = {
        "220 " .. group.name .. " - " .. group.summary,
        "",
        "Usage:",
        "  220 " .. group.name .. " <command> [options]",
        "",
        "Commands:",
    }
    for _, entry in ipairs(group.order) do
        local definition = Commands.get(entry[2])
        lines[#lines + 1] = string.format("  %-14s %s", entry[1], definition.summary)
    end
    lines[#lines + 1] = ""
    if group.legacy_flat ~= false then
        lines[#lines + 1] = "Legacy flat spellings remain accepted."
    end
    lines[#lines + 1] = "Run '220 help " .. group.name .. " <command>' for focused help."
    return table.concat(lines, "\n") .. "\n"
end

function M.render(overview, topic)
    if topic == nil or topic == "" then return overview end
    local target = Commands.resolve_help(topic)
    if not target then
        return nil, string.format("unknown help topic %q", tostring(topic))
    end
    return target.command and command_help(target) or group_help(target)
end

return M
