local check = require("unit.support")
local checkpoint_plan = require("tm_u220.live.checkpoint_plan")
local jobs = require("tm_u220.app.job_service")
local preview = require("tm_u220.render.preview")

local tests = {}

local function profile()
    return { variant = "B", paper = 76, dip2_1 = false, cutter = "partial" }
end

local function compile(source)
    local result = jobs.compile_content(source, { profile = profile() })
    check.equal(#result.diagnostics, 0, "unexpected compilation diagnostic")
    return result
end

local function build(source)
    local compiled = compile(source)
    local plan = checkpoint_plan.build(compiled)
    check.equal(#plan.diagnostics, 0, "unexpected checkpoint diagnostic")
    return plan, compiled
end

local function step_bytes(steps)
    local values = {}
    for index, step in ipairs(steps or {}) do values[index] = step.payload_bytes end
    return table.concat(values)
end

tests[#tests + 1] = { "plain lines become byte-exact checkpoints", function()
    local plan, compiled = build("A\nB")
    check.equal(#plan.steps, 2)
    check.equal(plan.steps[1].payload_bytes, check.bytes("1B 40 41 0A"))
    check.equal(plan.steps[2].payload_bytes, check.bytes("42 0A"))
    check.equal(plan.steps[1].kind, "line")
    check.equal(plan.steps[1].action.kind, "line")
    check.equal(plan.steps[1].preview_line_index, 1)
    check.equal(plan.steps[2].preview_line_index, 2)
    check.equal(step_bytes(plan.steps), compiled.bytes)
    check.equal(plan.payload_bytes, compiled.bytes)
end }

tests[#tests + 1] = { "Unicode page reset stays inside its live line checkpoint", function()
    local plan, compiled = build("Café Я\nOK")
    check.equal(#plan.steps, 2)
    check.equal(plan.steps[1].payload_bytes, check.bytes(
        "1B 40 43 61 66 82 20 1B 74 11 9F 1B 74 00 0A"))
    check.equal(plan.steps[2].payload_bytes, check.bytes("4F 4B 0A"))
    check.equal(step_bytes(plan.steps), compiled.bytes)
end }

tests[#tests + 1] = { "encoded parts retain exact node byte offsets", function()
    local compiled = compile("A")
    check.equal(#compiled.encoded_parts, #compiled.nodes)
    check.equal(compiled.encoded_parts[1].bytes, check.bytes("1B 40"))
    check.equal(compiled.encoded_parts[1].byte_first, 1)
    check.equal(compiled.encoded_parts[1].byte_last, 2)
    check.equal(compiled.encoded_parts[1].node_kind, "command")
    check.equal(compiled.encoded_parts[1].command_id, "control.initialize")
    check.equal(compiled.encoded_parts[2].bytes, "A")
    check.equal(compiled.encoded_parts[2].node_kind, "text")
    check.equal(compiled.encoded_parts[2].command_id, nil)
    check.equal(compiled.encoded_parts[2].byte_first, 3)
    check.equal(compiled.encoded_parts[3].bytes, check.bytes("0A"))
    check.equal(compiled.encoded_parts[3].byte_last, #compiled.bytes)
end }

tests[#tests + 1] = { "reset offsets come from initialize nodes, not payload scans", function()
    local plan, compiled = build(table.concat({ "A", "@init", "B" }, "\n"))
    check.equal(#plan.steps, 2)
    check.equal(plan.steps[1].reset_after_byte_offsets[1], 2)
    check.equal(#plan.steps[1].reset_after_byte_offsets, 1)
    check.equal(plan.steps[2].reset_after_byte_offsets[1], 2)
    check.equal(#plan.steps[2].reset_after_byte_offsets, 1)
    check.equal(step_bytes(plan.steps), compiled.bytes)
    check.equal(plan.payload_byte_count, #compiled.bytes)
end }

tests[#tests + 1] = { "tabs stay printer bytes while live text uses canonical preview", function()
    local plan, compiled = build(table.concat({
        "@emphasis on",
        "@text 0 | @tab | @text 8 | @line",
    }, "\n"))
    check.equal(#plan.steps, 1)
    check.equal(plan.steps[1].payload_bytes,
        check.bytes("1B 40 1B 45 01 30 09 38 0A"))
    local line = plan.steps[1].display
    check.equal(line, "001 | 0       8  [emphasis]")
    check.equal(line, preview.format_line(1, plan.steps[1].preview_line))
    check.contains(preview.render(compiled), line)
end }

tests[#tests + 1] = { "motion that flushes text maps that preview line", function()
    local plan, compiled = build(table.concat({
        "@text A | @feed 2",
        "@fi",
    }, "\n"))
    check.equal(#plan.steps, 3)
    check.equal(plan.steps[1].action.kind, "motion")
    check.equal(plan.steps[1].action.command_id, "print.feed_lines")
    check.equal(plan.steps[1].preview_line.text, "A")
    check.equal(plan.steps[2].action.kind, "motion")
    check.equal(plan.steps[2].preview_line_index, nil)
    check.equal(plan.steps[3].action.kind, "cut")
    check.equal(plan.steps[3].action.shape, "partial")
    check.equal(step_bytes(plan.steps), compiled.bytes)
end }

tests[#tests + 1] = { "zero feed remains a checkpoint without a preview line", function()
    local plan = build("A\n@feed 0")
    check.equal(#plan.steps, 2)
    check.equal(plan.steps[2].action.kind, "motion")
    check.equal(plan.steps[2].preview_line_index, nil)
    check.equal(plan.steps[2].payload_bytes, check.bytes("1B 64 00"))
end }

tests[#tests + 1] = { "wrap and implicit end feed map every preview line", function()
    local plan, compiled = build("@text " .. ("X"):rep(41))
    check.equal(#plan.steps, 2)
    check.equal(#compiled.preview_lines, 2)
    check.equal(plan.steps[1].action.reason, "wrap")
    check.equal(plan.steps[2].action.reason, "end_of_job")
    check.equal(#plan.steps[1].preview_line.text, 40)
    check.equal(plan.steps[2].preview_line.text, "X")
end }

tests[#tests + 1] = { "trailing control nodes are preserved as a control step", function()
    local plan, compiled = build("@color red")
    check.equal(#compiled.preview_lines, 0)
    check.equal(#plan.steps, 1)
    check.equal(plan.steps[1].action.kind, "control")
    check.equal(plan.steps[1].payload_bytes, check.bytes("1B 40 1B 72 01"))
    check.equal(step_bytes(plan.steps), compiled.bytes)
end }

tests[#tests + 1] = { "checkpoint framing is not part of planned payload", function()
    local plan, compiled = build("A\nB")
    local query = check.bytes("1D 72 01")
    check.falsy(plan.payload_bytes:find(query, 1, true))
    check.equal(plan.payload_byte_count, #compiled.bytes)
    check.equal(step_bytes(plan.steps), compiled.bytes)
end }

tests[#tests + 1] = { "invalid byte and boundary metadata fail atomically", function()
    local compiled = compile("A\nB")
    local wrong_bytes = {}
    for key, value in pairs(compiled) do wrong_bytes[key] = value end
    wrong_bytes.bytes = compiled.bytes .. "X"
    local plan = checkpoint_plan.build(wrong_bytes)
    check.equal(plan.steps, nil)
    check.equal(plan.diagnostics[1].code, "LIVE_PLAN_BYTES_MISMATCH")

    local wrong_boundary = {}
    for key, value in pairs(compiled) do wrong_boundary[key] = value end
    wrong_boundary.print_boundaries = {}
    for index, value in ipairs(compiled.print_boundaries) do
        wrong_boundary.print_boundaries[index] = {}
        for key, field in pairs(value) do
            wrong_boundary.print_boundaries[index][key] = field
        end
    end
    wrong_boundary.print_boundaries[1].after_node_index = 0
    plan = checkpoint_plan.build(wrong_boundary)
    check.equal(plan.steps, nil)
    check.equal(plan.diagnostics[1].code, "LIVE_PLAN_INVALID_BOUNDARY")
end }

tests[#tests + 1] = { "planner rejects trailing text that no operation can confirm", function()
    local plan = checkpoint_plan.build({
        nodes = { { kind = "text", value = "A" } },
        encoded_parts = { {
            node_index = 1, node_kind = "text",
            bytes = "A", byte_first = 1, byte_last = 1,
        } },
        bytes = "A",
        print_boundaries = {},
        preview_lines = {},
        diagnostics = {},
    })
    check.equal(plan.steps, nil)
    check.equal(plan.diagnostics[1].code, "LIVE_PLAN_UNPRINTED_TEXT")
end }

tests[#tests + 1] = { "cut boundaries cannot claim a mirrored text line", function()
    local compiled = compile("@fi")
    compiled.preview_lines = { { text = "not cut output" } }
    compiled.print_boundaries[#compiled.print_boundaries].preview_line_index = 1
    local plan = checkpoint_plan.build(compiled)
    check.equal(plan.steps, nil)
    check.equal(plan.diagnostics[1].code, "LIVE_PLAN_PREVIEW_MISMATCH")
end }

return tests
