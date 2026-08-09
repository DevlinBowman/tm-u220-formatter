local Json = require("tm_u220.core.json")

local M = {}

function M.render(value)
    return Json.encode(value) .. "\n"
end

return M
