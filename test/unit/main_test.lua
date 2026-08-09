local check = require("unit.support")
local Main = require("tm_u220.main")

local tests = {}

tests[#tests + 1] = { "devlink entry propagates CLI success status", function()
    local exited
    local returned = Main.main({ "help" }, {
        run = function() return 0 end,
        exit = function(code) exited = code return "stopped" end,
    })
    check.equal(exited, 0)
    check.equal(returned, "stopped")
end }

tests[#tests + 1] = { "devlink entry propagates CLI failure status", function()
    local exited
    Main.main({ "definitely-not-a-command" }, {
        run = function() return 2 end,
        exit = function(code) exited = code end,
    })
    check.equal(exited, 2)
end }

tests[#tests + 1] = { "devlink entry propagates live cancellation status", function()
    local exited
    Main.main({ "print", "receipt.u220" }, {
        run = function() return 130 end,
        exit = function(code) exited = code end,
    })
    check.equal(exited, 130)
end }

tests[#tests + 1] = { "devlink entry passes runtime facts into CLI dispatch", function()
    local received
    local runtime = {}
    runtime.run = function(_, value)
        received = value
        return 0
    end
    runtime.exit = function(code) return code end
    check.equal(Main.main({ "help" }, runtime), 0)
    check.equal(received, runtime)
end }

return tests
