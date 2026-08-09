-- Coordinates formatter state, ESC/POS command emission, and the canonical paper-preview plan.
local diagnostics = require("tm_u220.core.diagnostics")
local charset_pages = require("tm_u220.charset.pages")
local paper_motion = require("tm_u220.format.paper_motion")
local PaperPreview = require("tm_u220.format.preview.plan")
local state_api = require("tm_u220.format.state")
local text = require("tm_u220.format.text")

local Context = {}
Context.__index = Context

function Context.new(profile)
    local paper_plan = PaperPreview.new(profile)
    return setmetatable({
        profile = profile,
        state = state_api.new(profile),
        nodes = {},
        print_boundaries = {},
        diagnostics = {},
        preview_lines = paper_plan.lines,
        paper_plan = paper_plan,
        line_justification = profile.defaults.justification,
    }, Context)
end

function Context:add_diagnostic(code, message, span, severity)
    self.diagnostics[#self.diagnostics + 1] =
        diagnostics.new(code, message, span, severity)
end

function Context:command(id, args)
    self.nodes[#self.nodes + 1] = { kind = "command", id = id, args = args or {} }
    return #self.nodes
end

function Context:add_print_boundary(values)
    self.print_boundaries[#self.print_boundaries + 1] = values
    return values
end

function Context:require_beginning(label, span)
    if state_api.at_beginning(self.state) then return true end
    self:add_diagnostic(
        "FORMAT_REQUIRES_LINE_BEGINNING",
        label .. " is valid only at the beginning of a line",
        span
    )
    return false
end

function Context:validate_text(value, span)
    return text.validate(self, value, span) ~= nil
end

function Context:text_cells(value, span)
    return text.cells(self, value, span)
end

function Context:text_slice(value, first, count)
    return text.slice(value, first, count)
end

function Context:select_code_table(page, force)
    if not force and self.state.code_table == page then return end
    self:command("style.code_table", { table = page })
    self.state.code_table = page
end

function Context:lock_code_table(page, span)
    if not charset_pages.has_page(page) then
        self:add_diagnostic(
            "FORMAT_CODE_PAGE_UNAVAILABLE",
            "character page " .. tostring(page)
                .. " is not available in the public standard-page catalog",
            span
        )
        return false
    end
    self.state.code_table_lock = page
    self:select_code_table(page, true)
    return true
end

function Context:restore_default_code_table()
    self.state.code_table_lock = nil
    self:select_code_table(self.profile.defaults.code_table)
end

function Context:emit_text(display, bytes, cells, span, code_page)
    if bytes == "" then return end
    if self.paper_plan:empty() then
        self.line_justification = self.state.justification
    end
    self.nodes[#self.nodes + 1] = {
        kind = "text",
        value = bytes,
        display_text = display,
        code_page = code_page,
    }
    self.paper_plan:add_text(
        display, self.state, span, cells, code_page, bytes)
    state_api.consume(self.state, cells)
end

function Context:finish_line(reason, include_empty, span)
    local line = self.paper_plan:finish_line(
        self.state, self.line_justification, reason, include_empty, span)
    self.line_justification = self.state.justification
    state_api.line_feed(self.state)
    return line
end

function Context:move_paper(vertical_units, reason, span, details)
    self.paper_plan:move(vertical_units, reason, span, details)
end

function Context:line_feed(reason, span)
    self:restore_default_code_table()
    local node_index = self:command("print.line_feed")
    local line = self:finish_line(reason, true, span)
    self:move_paper(line.line_advance_vertical_units,
        reason or "line_feed", span)
    self:add_print_boundary({
        kind = "line",
        command_id = "print.line_feed",
        after_node_index = node_index,
        preview_line_index = #self.preview_lines,
        reason = reason or "line_feed",
        source_span = span or line.source_span,
    })
end

function Context:print_motion(id, args, reason, span)
    self:restore_default_code_table()
    local node_index = self:command(id, args)
    local line = self:finish_line(reason, false, span)
    local units = args.vertical_units
    if args.lines then
        units = args.lines * self.state.line_spacing
        if line and args.lines > 0 then
            units = units + math.max(0,
                line.line_advance_vertical_units - line.line_spacing_vertical_units)
        end
    end
    local motion
    if id == "print.reverse_feed_lines" or id == "print.reverse_feed_units" then
        motion = paper_motion.reverse(self.profile, units)
        units = motion.effective_vertical_units
    end
    self:move_paper(units or 0, reason, span, motion)
    self:add_print_boundary({
        kind = "motion",
        command_id = id,
        after_node_index = node_index,
        preview_line_index = line and #self.preview_lines or nil,
        reason = reason,
        source_span = span or (line and line.source_span) or nil,
    })
end

function Context:cut(args, shape, span)
    self:restore_default_code_table()
    local node_index = self:command("mechanism.cut", args)
    local travel = self.profile.head_to_cutter_vertical_units or 0
    self:move_paper(travel + (args.feed_units or 0), "cutter_advance", span)
    self.paper_plan:add_cut(shape, span)
    self:add_print_boundary({
        kind = "cut",
        command_id = "mechanism.cut",
        after_node_index = node_index,
        shape = shape,
        source_span = span,
    })
end

function Context:text(value, span)
    return text.write(self, value, span)
end

function Context:horizontal_tab(span)
    self:command("control.horizontal_tab")
    local before = self.state.used_half_dots
    if not state_api.horizontal_tab(self.state) then
        self:add_diagnostic(
            "FORMAT_TAB_IGNORED",
            "no horizontal tab stop remains on this line",
            span,
            "warning"
        )
        return
    end
    local distance = self.state.used_half_dots - before
    local columns = math.ceil(distance / state_api.character_advance(self.state))
    if columns > 0 then
        self.paper_plan:add_tab(before, distance, columns, self.state, span)
    end
end

function Context:paper_preview()
    return self.paper_plan:result()
end

function Context:reset()
    state_api.reset(self.state)
    self.paper_plan:reset_line()
    self.line_justification = self.state.justification
end

return Context
