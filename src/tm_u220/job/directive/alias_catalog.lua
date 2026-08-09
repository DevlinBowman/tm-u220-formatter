-- Loads the checked-in directive-alias catalog as a runtime authoring resource.
-- Keeping file access here leaves alias syntax and alias expansion independently testable.
local AliasFile = require("tm_u220.job.directive.alias_file")
local ConfigFiles = require("tm_u220.config.files")
local FS = require("tm_u220.core.fs")

local M = {}
M.RELATIVE_PATH = "config/directives/aliases.u220a"

function M.default_path()
    return ConfigFiles.factory_path("aliases")
end

function M.load(path)
    path = path or M.default_path()
    if not path then
        return nil, {
            code = "job.directive.alias_config_read_failed",
            message = "cannot locate " .. M.RELATIVE_PATH,
        }
    end

    local source, read_failure = FS.read(path, false)
    if not source then
        return nil, {
            code = "job.directive.alias_config_read_failed",
            message = read_failure,
        }
    end

    local document = AliasFile.parse(source)
    if #document.diagnostics > 0 then
        local first = document.diagnostics[1]
        return nil, {
            code = "job.directive.alias_config_invalid",
            message = string.format("%s:%d: %s", path, first.line, first.message),
        }
    end
    document.path = path
    return document
end

return M
