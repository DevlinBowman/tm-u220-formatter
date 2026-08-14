-- Verifies key-value field separators normalize into one canonical layout operation.
-- Alternate punctuation splits at its final occurrence without changing pipe behavior.
local check = require("unit.support")
local Directive = require("tm_u220.job.directive")

local tests = {}

local function assert_parts(source, expected_left, expected_right)
    local operation, failure = Directive.parse(source)
    check.falsy(failure, source)
    check.equal(operation.kind, "kv", source)
    check.equal(operation.left, expected_left, source)
    check.equal(operation.right, expected_right, source)
end

tests[#tests + 1] = { "key-value accepts and consumes alternate separators", function()
    assert_parts("@kv Label = Value", "Label", "Value")
    assert_parts("@kv Label ; Value", "Label", "Value")
    assert_parts("@kv Label : Value", "Label", "Value")
    assert_parts("@kv LEFT:RIGHT", "LEFT", "RIGHT")
end }

tests[#tests + 1] = { "key-value uses the final alternate separator", function()
    assert_parts("@kv alpha=beta=omega", "alpha=beta", "omega")
    assert_parts("@kv alpha=beta:gamma;omega", "alpha=beta:gamma", "omega")
    assert_parts("@kv A==B", "A=", "B")
end }

tests[#tests + 1] = { "key-value retains canonical pipe precedence", function()
    assert_parts("@kv A=B | C:D", "A=B", "C:D")
    assert_parts("@kv A|B|C", "A", "B|C")
end }

tests[#tests + 1] = {
    "key-value rejects blank fields at the selected separator", function()
    local cases = {
        "@kv =RIGHT", "@kv LEFT=", "@kv ;RIGHT", "@kv LEFT;",
        "@kv :RIGHT", "@kv LEFT:", "@kv A=B=",
    }
    for _, source in ipairs(cases) do
        local operation, failure = Directive.parse(source)
        check.equal(operation, nil, source)
        check.equal(failure.code, "job.directive.invalid_arguments", source)
        check.contains(failure.message, "final =, ;, or :", source)
    end
end }

return tests
