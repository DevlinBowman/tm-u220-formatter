-- Verifies authoring configuration resolves to checkout files or writable installed-user copies.
-- Tests inject release and environment facts so no real home-directory configuration is consulted.
local check = require("unit.support")
local Files = require("tm_u220.config.files")

local tests = {}

local function environment(values)
    return function(name) return values[name] end
end

tests[#tests + 1] = { "checkout configuration edits and loads checked-in files", function()
    local runtime = {
        project_root = "/work/tm-u220",
        managed_release = false,
        getenv = function() error("checkout paths must not inspect HOME") end,
    }
    local editable = assert(Files.editable(runtime))
    check.equal(editable[1].name, "aliases")
    check.equal(editable[1].path, "/work/tm-u220/config/directives/aliases.u220a")
    check.equal(editable[2].name, "profile")
    check.equal(editable[2].path, "/work/tm-u220/config/printers/local.u220p")
    check.equal(editable[1].user_owned, false)
    check.equal(Files.active_path("profile", runtime), editable[2].path)
end }

tests[#tests + 1] = { "managed releases prefer existing XDG user configuration", function()
    local alias_path = "/users/operator/config/tm-u220/directives/aliases.u220a"
    local runtime = {
        project_root = "/release",
        managed_release = true,
        getenv = environment({ XDG_CONFIG_HOME = "/users/operator/config", HOME = "/ignored" }),
        exists = function(path) return path == alias_path end,
    }
    local editable = assert(Files.editable(runtime))
    check.equal(editable[1].path, alias_path)
    check.equal(editable[2].path,
        "/users/operator/config/tm-u220/printers/local.u220p")
    check.equal(editable[1].user_owned, true)
    check.equal(Files.active_path("aliases", runtime), alias_path)
    check.equal(Files.active_path("profile", runtime),
        "/release/config/printers/local.u220p")
end }

tests[#tests + 1] = { "configuration root supports explicit and HOME fallback paths", function()
    check.equal(assert(Files.user_root({ getenv = environment({
        TM_U220_CONFIG_HOME = "/custom/u220",
    }) })), "/custom/u220")
    check.equal(assert(Files.user_root({ getenv = environment({
        HOME = "/Users/example",
    }) })), "/Users/example/.config/tm-u220")
    local root, failure = Files.user_root({ getenv = environment({
        TM_U220_CONFIG_HOME = "relative",
    }) })
    check.equal(root, nil)
    check.contains(failure, "absolute path")
    root, failure = Files.user_root({ getenv = environment({
        XDG_CONFIG_HOME = "relative",
        HOME = "/Users/example",
    }) })
    check.equal(root, nil)
    check.contains(failure, "XDG_CONFIG_HOME")
end }

tests[#tests + 1] = { "managed active paths fail closed on invalid environment roots", function()
    local path, failure = Files.active_path("aliases", {
        project_root = "/release",
        managed_release = true,
        getenv = environment({ HOME = "relative" }),
    })
    check.equal(path, nil)
    check.contains(failure, "HOME must be an absolute path")
end }

return tests
