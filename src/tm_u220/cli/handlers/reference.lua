-- Implements help, version, rules, and printer-profile reference commands from canonical sources.
-- Profile decoding performs only response processing because query selection is parser-validated.
local Bytes = require("tm_u220.core.bytes")
local Discovery = require("tm_u220.profile.discovery")
local Fs = require("tm_u220.core.fs")
local Help = require("tm_u220.cli.help")
local Json = require("tm_u220.render.json")
local ProfileRender = require("tm_u220.render.profile")
local Rules = require("tm_u220.render.rules")
local RulesCommand = require("tm_u220.cli.rules_command")
local Version = require("tm_u220.version")

local M = {}

local function help_command(parsed, _, output)
    local value, err = Help.render(parsed.topic)
    if not value then return output:usage_error(err) end
    output:stdout(value)
    return 0
end

local function version_command(_, _, output)
    output:line("220 " .. Version.value)
    return 0
end

local function directives_command(_, _, output)
    output:stdout(Rules.directive_list())
    return 0
end

local function query_command(parsed, _, output)
    local values = Discovery.queries()
    local value = parsed.options.json and Json.render(values) or ProfileRender.queries(values)
    return output:result(parsed.options.output, value, false)
end

local function decode_command(parsed, _, output)
    local response, err = Fs.read(parsed.input, parsed.options.input_kind == "raw")
    if not response then
        output:error_line(err)
        return 1
    end
    if parsed.options.input_kind == "hex" then
        response, err = Bytes.from_hex(response)
        if not response then
            output:error_line(err)
            return 1
        end
    end
    local fact, failure = Discovery.decode(parsed.query_id, response)
    if not fact then
        output:diagnostics({ failure })
        return 1
    end
    local value = parsed.options.json and Json.render(fact) or ProfileRender.fact(fact)
    return output:result(parsed.options.output, value, false)
end

M.handlers = {
    directives = directives_command,
    help = help_command,
    version = version_command,
    rules = RulesCommand.run,
    ["profile-queries"] = query_command,
    ["profile-decode"] = decode_command,
}

return M
