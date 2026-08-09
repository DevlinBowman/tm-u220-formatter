local script = arg and arg[0] or "web/server/preview_worker.lua"
local root = script:match("^(.*)/web/server/preview_worker%.lua$") or "."
if root == "" then root = "." end

package.path = root .. "/src/?.lua;" .. root .. "/src/?/init.lua;"
    .. package.path

local Json = require("tm_u220.core.json")
local Jobs = require("tm_u220.app.job_service")
local Defaults = require("tm_u220.app.local_defaults")

local function options(argv)
    local value = {
        alias_path = root .. "/config/directives/aliases.u220a",
        profile_path = Defaults.profile_path(root),
    }
    local index = 1
    while index <= #argv do
        local token = argv[index]
        if token == "--text" then
            value.text = true
            index = index + 1
        elseif token == "--aliases" and argv[index + 1] then
            value.alias_path = argv[index + 1]
            index = index + 2
        elseif token == "--profile" and argv[index + 1] then
            value.profile_path = argv[index + 1]
            index = index + 2
        else
            error("unknown preview worker option: " .. tostring(token), 0)
        end
    end
    return value
end

local function compile()
    local source = io.read("*a") or ""
    local result = Jobs.compile_content(source, options(arg or {}))
    return {
        valid = result.bytes ~= nil,
        byte_count = result.bytes and #result.bytes or 0,
        profile = result.profile,
        lines = result.preview_lines or {},
        paper_preview = result.paper_preview,
        finish = result.finish,
        diagnostics = result.diagnostics or {},
        normalization = result.normalization,
        source_line_offset = result.source_line_offset or 0,
    }
end

local ok, result = pcall(compile)
if not ok then
    io.stderr:write(tostring(result), "\n")
    os.exit(1)
end

io.write(Json.encode(result), "\n")
