-- Validates profile-tool arguments against the discovery domain's canonical query catalog.
-- This keeps unsupported query IDs in the usage-error path before response files are opened.
local Discovery = require("tm_u220.profile.discovery")

local M = {}

function M.validate(result)
    if Discovery.query(result.query_id) then return result end
    return nil, string.format(
        "unknown profile query ID %q; run '220 profile-queries' to list supported IDs",
        tostring(result.query_id))
end

return M
