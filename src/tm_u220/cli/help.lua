-- Exposes concise overview and descriptor-backed focused help for the public CLI.
local Renderer = require("tm_u220.cli.help_renderer")

local M = { text = Renderer.overview() }

function M.render(topic)
    return Renderer.render(M.text, topic)
end

return M
