-- Proves @fi is a reusable in-flow feed-cut-reset action rather than a terminator.
-- Repeated finishes restore defaults while retaining preview and checkpoint metadata.
local check = require("unit.support")
local checkpoint_plan = require("tm_u220.live.checkpoint_plan")
local job_service = require("tm_u220.app.job_service")

local tests = {}

local function profile()
    return {
        variant = "B", paper = 76, dip2_1 = false, cutter = "partial",
    }
end

local function compile(source)
    return job_service.compile_content(source, { profile = profile() })
end

local function count(values, field, wanted)
    local total = 0
    for _, value in ipairs(values or {}) do
        if value[field] == wanted then total = total + 1 end
    end
    return total
end

local function matching(values, field, wanted)
    local found = {}
    for _, value in ipairs(values or {}) do
        if value[field] == wanted then found[#found + 1] = value end
    end
    return found
end

local function step_bytes(steps)
    local values = {}
    for _, step in ipairs(steps or {}) do values[#values + 1] = step.payload_bytes end
    return table.concat(values)
end

tests[#tests + 1] = { "@fi may repeat before later content", function()
    local result = compile(table.concat({ "A", "@fi", "B", "@fi", "C" }, "\n"))
    check.equal(#result.diagnostics, 0)
    check.equal(count(result.nodes, "id", "print.feed_lines"), 2)
    check.equal(count(result.nodes, "id", "mechanism.cut"), 2)
    check.equal(count(result.nodes, "id", "control.initialize"), 3)
    check.equal(#result.preview_lines, 3)
    check.equal(result.preview_lines[2].text, "B")
    check.equal(result.finish, nil)

    local motions = matching(result.print_boundaries, "reason", "finish")
    local cuts = matching(result.print_boundaries, "kind", "cut")
    local paper_cuts = matching(result.paper_preview.events, "kind", "cut")
    check.equal(#motions, 2)
    check.equal(#cuts, 2)
    check.equal(#paper_cuts, 2)
    for index, line in ipairs({ 3, 5 }) do
        check.equal(motions[index].command_id, "print.feed_lines")
        check.equal(motions[index].preview_line_index, nil)
        check.equal(motions[index].source_span.start_line, line)
        check.equal(cuts[index].command_id, "mechanism.cut")
        check.equal(cuts[index].shape, "partial")
        check.equal(cuts[index].preview_line_index, nil)
        check.equal(cuts[index].source_span.start_line, line)
        check.equal(paper_cuts[index].shape, "partial")
        check.equal(paper_cuts[index].source_span.start_line, line)
    end
    check.equal(paper_cuts[1].y_vertical_units, 273)
    check.equal(paper_cuts[2].y_vertical_units, 546)

    local plan = checkpoint_plan.build(result)
    check.equal(#plan.diagnostics, 0)
    check.equal(step_bytes(plan.steps), result.bytes)
    local actions = {}
    for _, step in ipairs(plan.steps) do
        actions[#actions + 1] = step.action and step.action.kind or "line"
    end
    check.equal(table.concat(actions, ","),
        "line,motion,cut,line,motion,cut,line")
    for _, index in ipairs({ 2, 5 }) do
        check.equal(plan.steps[index].action.command_id, "print.feed_lines")
        check.equal(plan.steps[index].action.reason, "finish")
        check.equal(plan.steps[index].preview_line_index, nil)
    end
    for _, index in ipairs({ 3, 6 }) do
        check.equal(plan.steps[index].action.command_id, "mechanism.cut")
        check.equal(plan.steps[index].action.shape, "partial")
        check.equal(plan.steps[index].preview_line_index, nil)
    end
    for _, index in ipairs({ 4, 7 }) do
        check.equal(plan.steps[index].reset_after_byte_offsets[1], 2)
        check.equal(#plan.steps[index].reset_after_byte_offsets, 1)
    end
end }

tests[#tests + 1] = {
    "@fi matches its canonical actions and resets style", function()
    local concise = compile(table.concat({
        "@emphasis on", "A", "@fi", "B", "@fi",
    }, "\n"))
    local expanded = compile(table.concat({
        "@emphasis on", "A", "@feed 4", "@cut installed", "@init",
        "B", "@feed 4", "@cut installed", "@init",
    }, "\n"))
    check.equal(#concise.diagnostics, 0)
    check.equal(#expanded.diagnostics, 0)
    check.equal(concise.bytes, expanded.bytes)
    check.equal(count(concise.nodes, "id", "control.initialize"), 3)
    check.equal(concise.preview_lines[2].segments[1].style.emphasis, false)
end }

tests[#tests + 1] = { "@fi keeps placement and cutter safety checks", function()
    local misplaced = compile("@text X\n@fi")
    check.equal(misplaced.diagnostics[1].code,
        "FORMAT_REQUIRES_LINE_BEGINNING")
    check.equal(count(misplaced.nodes, "id", "mechanism.cut"), 0)
    check.equal(misplaced.bytes, nil)

    local unavailable = job_service.compile_content("@fi", { profile = {
        variant = "D", paper = 76, dip2_1 = false, cutter = "none",
    } })
    check.equal(unavailable.diagnostics[1].code, "FORMAT_CUTTER_UNAVAILABLE")
    check.equal(count(unavailable.nodes, "id", "mechanism.cut"), 0)
    check.equal(unavailable.bytes, nil)
end }

tests[#tests + 1] = { "a final @fi keeps the terminal summary", function()
    local result = compile("@fi\nMiddle\n@fi")
    check.equal(#result.diagnostics, 0)
    check.equal(count(result.nodes, "id", "mechanism.cut"), 2)
    check.equal(result.nodes[#result.nodes].id, "control.initialize")
    check.equal(result.finish.advance_to_cut_position, true)
    check.equal(result.finish.feed_lines, 4)
    check.equal(result.finish.feed_units, 0)
    check.equal(result.finish.cut_shape, "partial")
end }

return tests
