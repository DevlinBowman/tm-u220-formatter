-- Renders the rules index and focused native authoring reference pages.
local Catalog = require("tm_u220.render.rules.catalog")

local M = {}

local function index()
    local lines = {
        "220 rules - TM-U220 formatting reference",
        "",
        "Usage:",
        "  220 rules <topic>",
        "",
        "Topics:",
    }
    for _, name in ipairs(Catalog.order) do
        local entry = Catalog.entries[name]
        lines[#lines + 1] = string.format("  %-12s %s", name, entry.summary)
    end
    lines[#lines + 1] = ""
    lines[#lines + 1] = "Quick examples:"
    lines[#lines + 1] = "  220 print \"hello from the printer\""
    lines[#lines + 1] = "  220 render notes.txt"
    lines[#lines + 1] = "  220 print receipt.u220"
    lines[#lines + 1] = ""
    lines[#lines + 1] = "Run 220 directives for the complete compact directive list."
    lines[#lines + 1] = "Run 220 rules <topic> for a focused page."
    return table.concat(lines, "\n") .. "\n"
end

local function canonical_topic(topic)
    if type(topic) ~= "string" then return nil end
    local normalized = topic:lower()
    return Catalog.aliases[normalized] or normalized
end

function M.topics()
    local result = {}
    for index_value, name in ipairs(Catalog.order) do result[index_value] = name end
    return result
end

function M.directive_list()
    return Catalog.entries.directives.list
end

function M.render(topic)
    if topic == nil then return index() end
    local canonical = canonical_topic(topic)
    local entry = canonical and Catalog.entries[canonical] or nil
    if not entry then
        return nil, string.format(
            "unknown rules topic %q; run '220 rules' to list topics", tostring(topic))
    end
    return entry.text .. "\nRun 220 rules to list every topic.\n"
end

return M
