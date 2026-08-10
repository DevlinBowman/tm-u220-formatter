-- Launches the fixed image-profile editor helper for one source image and active printer profile.
-- The helper owns the editable image-profile target and exposes no printer transport.
local HelperProcess = require("tm_u220.app.helper_process")

local M = {}

local function positional_image(path)
    if type(path) == "string" and path:sub(1, 1) == "-" then return "./" .. path end
    return path
end

function M.launch_spec(image_path, options)
    options = options or {}
    return HelperProcess.launch_spec("image_profile_editor/main.mjs",
        "TM-U220 image profile editor", {
            positional_image(image_path),
            "--profile", options.profile_path,
        })
end

function M.run(image_path, options, runtime)
    local result = HelperProcess.run(M.launch_spec(image_path, options), runtime)
    if not result then return 1, "image profile editor returned an invalid result" end
    return HelperProcess.exit_code(result)
end

return M
