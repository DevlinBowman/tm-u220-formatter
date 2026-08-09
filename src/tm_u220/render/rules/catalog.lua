-- Registers built-in rules topics and their user-facing aliases.
local M = {}

M.order = {
    "document", "job", "directives", "profile", "examples",
}

M.entries = {}
for _, topic in ipairs(M.order) do
    M.entries[topic] = require("tm_u220.render.rules.topics." .. topic)
end

M.aliases = {
    documents = "document",
    text = "document",
    input = "document",
    jobs = "job",
    u220 = "job",
    directive = "directives",
    commands = "directives",
    formatting = "directives",
    profiles = "profile",
    printer = "profile",
    example = "examples",
}

return M
