-- Loads the installed printing policy and selected physical profile as one machine boundary.
-- Callers may inject file access for tests, but production always uses root-owned fixed paths.
local Manifest = require("tm_u220.printing.manifest")
local Sha256 = require("tm_u220.core.sha256")

local M = {}

local function read(path, open_file)
    local file, err = open_file(path, "rb")
    if not file then return nil, err end
    local value = file:read("*a") or ""
    local close_ok, close_err = file:close()
    if close_ok == nil then return nil, close_err end
    return value
end

function M.load(runtime)
    runtime = runtime or {}
    local open_file = runtime.open or io.open
    local manifest_bytes, err = read(runtime.manifest_path or Manifest.INSTALLED_PATH, open_file)
    if not manifest_bytes then
        return nil, "printing is not configured; run 220 setup-printing"
            .. (err and " (" .. tostring(err) .. ")" or "")
    end
    local manifest
    manifest, err = Manifest.parse(manifest_bytes)
    if not manifest then return nil, "installed printing manifest is invalid: " .. err end
    local profile_bytes
    profile_bytes, err = read(runtime.profile_path or manifest.profile_path, open_file)
    if not profile_bytes then return nil, "installed printer profile cannot be read: " .. tostring(err) end
    if #profile_bytes ~= manifest.profile_bytes then
        return nil, "installed printer profile length does not match the printing manifest"
    end
    local hash = (runtime.sha256 or Sha256.hex)(profile_bytes)
    if hash ~= manifest.profile_sha256 then
        return nil, "installed printer profile hash does not match the printing manifest"
    end
    manifest.manifest_bytes = manifest_bytes
    manifest.profile_source = profile_bytes
    return manifest
end

return M
