local model = require("tm_u220.spec.model")
local profile = require("tm_u220.spec.profile")

local families = {
    require("tm_u220.spec.commands.control"),
    require("tm_u220.spec.commands.style"),
    require("tm_u220.spec.commands.position"),
    require("tm_u220.spec.commands.print"),
    require("tm_u220.spec.commands.mechanism"),
}

local commands = {}
local by_id = {}
local prefixes = {}

local function prefix_key(prefix)
    local out = {}
    for index, byte in ipairs(prefix) do
        assert(type(byte) == "number" and byte >= 0 and byte <= 255 and byte % 1 == 0,
            "invalid command-prefix byte")
        out[index] = string.char(byte)
    end
    return table.concat(out)
end

for _, family in ipairs(families) do
    for _, command in ipairs(family) do
        assert(not by_id[command.id], "duplicate command id: " .. command.id)
        local key = prefix_key(command.prefix)
        assert(not prefixes[key], "duplicate command prefix: " .. command.mnemonic)
        commands[#commands + 1] = command
        by_id[command.id] = command
        prefixes[key] = command
    end
end

return {
    model = model,
    profile = profile,
    commands = commands,
    by_id = by_id,
}
