-- Composes responsibility-focused command handlers and enforces exact parity with the CLI catalog.
-- Grouped aliases resolve before dispatch and therefore intentionally share canonical handlers.
local Commands = require("tm_u220.cli.commands")
local Authoring = require("tm_u220.cli.handlers.authoring")
local Configuration = require("tm_u220.cli.handlers.configuration")
local Printing = require("tm_u220.cli.handlers.printing")
local Reference = require("tm_u220.cli.handlers.reference")

local M = {}
local HANDLERS = {}

local function include(source)
    for name, handler in pairs(source) do
        assert(HANDLERS[name] == nil, "duplicate CLI handler " .. name)
        HANDLERS[name] = handler
    end
end

include(Authoring.handlers)
include(Configuration.handlers)
include(Printing.handlers)
include(Reference.handlers)

function M.assert_complete()
    local expected = 0
    for _, name in ipairs(Commands.order) do
        expected = expected + 1
        assert(type(HANDLERS[name]) == "function", "missing CLI handler " .. name)
    end
    local actual = 0
    for name in pairs(HANDLERS) do
        actual = actual + 1
        assert(Commands.get(name), "handler has no CLI command " .. name)
    end
    assert(actual == expected, "CLI command and handler counts differ")
    return true
end

function M.get(name)
    return HANDLERS[name]
end

M.handlers = HANDLERS
M.assert_complete()

return M
