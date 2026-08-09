-- Declares the shipped authoring templates and their writable installed-user counterparts.
-- Checkout commands use checked-in files directly; managed releases prefer seeded user copies.
local M = {}

local DEFINITIONS = {
    { name = "aliases", label = "directive aliases",
        factory_relative = "config/directives/aliases.u220a",
        user_relative = "directives/aliases.u220a" },
    { name = "profile", label = "authoring printer profile",
        factory_relative = "config/printers/local.u220p",
        user_relative = "printers/local.u220p" },
    { name = "image_profile", label = "image interpretation profile",
        factory_relative = "config/images/default.u220i",
        user_relative = "images/default.u220i" },
}

local BY_NAME = {}
for _, definition in ipairs(DEFINITIONS) do BY_NAME[definition.name] = definition end

local function normalize(path)
    path = tostring(path):gsub("\\", "/")
    if path ~= "/" then path = path:gsub("/+$", "") end
    return path
end

local function join(root, relative)
    root = normalize(root)
    if root == "/" then return "/" .. relative end
    return root .. "/" .. relative
end

local function module_project_root()
    local source = debug.getinfo(1, "S").source or ""
    if source:sub(1, 1) == "@" then source = source:sub(2) end
    source = normalize(source)
    local suffix = "/src/tm_u220/config/files.lua"
    if source:sub(-#suffix) == suffix then
        local root = source:sub(1, #source - #suffix)
        return root == "" and "/" or root
    end
    local relative = "src/tm_u220/config/files.lua"
    if source == relative or source == "./" .. relative then return "." end
    error("cannot locate the TM-U220 project root from " .. source, 0)
end

local PROJECT_ROOT = module_project_root()

local function exists(path, runtime)
    if runtime and runtime.exists then return runtime.exists(path) == true end
    local handle = io.open(path, "rb")
    if not handle then return false end
    handle:close()
    return true
end

local function getenv(runtime, name)
    return (runtime and runtime.getenv or os.getenv)(name)
end

local function absolute(value)
    return type(value) == "string" and value:sub(1, 1) == "/"
end

function M.project_root(runtime)
    return normalize(runtime and runtime.project_root or PROJECT_ROOT)
end

function M.get(name)
    return BY_NAME[name]
end

function M.factory_path(name, runtime)
    local definition = assert(BY_NAME[name], "unknown configuration file " .. tostring(name))
    return join(M.project_root(runtime), definition.factory_relative)
end

function M.is_managed_release(runtime)
    if runtime and runtime.managed_release ~= nil then
        return runtime.managed_release == true
    end
    return exists(join(M.project_root(runtime), ".tm-u220-install.json"), runtime)
end

function M.user_root(runtime)
    local explicit = getenv(runtime, "TM_U220_CONFIG_HOME")
    if explicit and explicit ~= "" then
        if not absolute(explicit) then
            return nil, "TM_U220_CONFIG_HOME must be an absolute path"
        end
        return normalize(explicit)
    end
    local xdg = getenv(runtime, "XDG_CONFIG_HOME")
    if xdg and xdg ~= "" then
        if not absolute(xdg) then
            return nil, "XDG_CONFIG_HOME must be an absolute path"
        end
        return join(xdg, "tm-u220")
    end
    local home = getenv(runtime, "HOME")
    if home and home ~= "" then
        if not absolute(home) then return nil, "HOME must be an absolute path" end
        return join(home, ".config/tm-u220")
    end
    return nil, "HOME is required to locate editable TM-U220 configuration"
end

function M.user_path(name, runtime)
    local definition = assert(BY_NAME[name], "unknown configuration file " .. tostring(name))
    local root, failure = M.user_root(runtime)
    if not root then return nil, failure end
    return join(root, definition.user_relative)
end

function M.active_path(name, runtime)
    local factory = M.factory_path(name, runtime)
    if not M.is_managed_release(runtime) then return factory end
    local user, failure = M.user_path(name, runtime)
    if not user then return nil, failure end
    if user and exists(user, runtime) then return user end
    return factory
end

function M.editable(runtime)
    local user_owned = M.is_managed_release(runtime)
    local result = {}
    for _, definition in ipairs(DEFINITIONS) do
        local path, failure
        if user_owned then path, failure = M.user_path(definition.name, runtime)
        else path = M.factory_path(definition.name, runtime) end
        if not path then return nil, failure end
        result[#result + 1] = {
            name = definition.name,
            label = definition.label,
            path = path,
            factory_path = M.factory_path(definition.name, runtime),
            user_owned = user_owned,
        }
    end
    return result
end

M.definitions = DEFINITIONS

return M
