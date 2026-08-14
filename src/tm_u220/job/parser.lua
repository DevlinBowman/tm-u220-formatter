-- Parses versioned U220 source into native text and directive operations.
local Diagnostic = require("tm_u220.job.diagnostic")
local Directive = require("tm_u220.job.directive")
local AliasCatalog = require("tm_u220.job.directive.alias_catalog")
local DirectiveSyntax = require("tm_u220.job.directive.syntax")
local KvBlock = require("tm_u220.job.block.kv")

local M = {}
local HEADER = "!tm-u220 job 1"
local NO_ALIASES = {}

local function split_lines(source)
    local lines = {}
    local cursor = 1

    while true do
        local newline = source:find("\n", cursor, true)
        if not newline then
            if cursor <= #source or #source == 0 then
                lines[#lines + 1] = source:sub(cursor):gsub("\r$", "")
            end
            break
        end

        lines[#lines + 1] = source:sub(cursor, newline - 1):gsub("\r$", "")
        cursor = newline + 1
        if cursor > #source then
            break
        end
    end

    return lines
end

local function add_diagnostic(document, code, message, line)
    document.diagnostics[#document.diagnostics + 1] = Diagnostic.error(
        code,
        message,
        Diagnostic.line_span(line)
    )
end

local function find_header(document, lines)
    for line_number, line in ipairs(lines) do
        if line:sub(1, 1) ~= "#" then
            if line ~= HEADER then
                add_diagnostic(
                    document,
                    "job.header.required",
                    "first non-comment line must be exactly " .. HEADER,
                    line_number
                )
                return nil
            end
            return line_number
        end
    end

    add_diagnostic(
        document,
        "job.header.missing",
        "job header is missing; expected " .. HEADER,
        #lines + 1
    )
    return nil
end

local function add_operation(document, operation)
    if operation.kind == "profile" then
        if next(document.profile) ~= nil then
            add_diagnostic(
                document,
                "job.profile.duplicate",
                "@profile may appear only once",
                operation.value.span.start_line
            )
            return
        end
        document.profile = operation.value
        return
    end

    document.ops[#document.ops + 1] = operation
end

local function add_text_line(document, text, span)
    add_operation(document, {
        kind = "text_line",
        text = text,
        span = span,
    })
end

function M.parse(source, options)
    options = options or {}
    local document = {
        version = 1,
        profile = {},
        ops = {},
        diagnostics = {},
    }

    if type(source) ~= "string" then
        add_diagnostic(
            document,
            "job.input.invalid_type",
            "job source must be a string",
            1
        )
        return document
    end

    local lines = split_lines(source)
    local header_line = find_header(document, lines)
    if not header_line then
        return document
    end
    local aliases = options.aliases
    if not aliases then
        local catalog, alias_failure = AliasCatalog.load(options.alias_path)
        if not catalog then
            add_diagnostic(document, alias_failure.code, alias_failure.message, 1)
            return document
        end
        aliases = catalog.entries
    end
    local kv_block = KvBlock.new()
    for line_number = header_line + 1, #lines do
        local line, block_failure, fallback_line, kv_candidate = kv_block:process(
            lines[line_number], line_number)
        local span = Diagnostic.line_span(line_number)
        if block_failure then
            add_diagnostic(document, block_failure.code,
                block_failure.message, block_failure.line)
        elseif kv_candidate then
            local operation, failure = Directive.parse(line, span, NO_ALIASES)
            if operation and operation.kind == "kv" then
                add_operation(document, operation)
                line = nil
            elseif fallback_line then
                line = fallback_line
            else
                add_diagnostic(document, failure.code, failure.message, line_number)
                line = nil
            end
        end
        if line ~= nil and not block_failure then
            local escaped_directive = DirectiveSyntax.unescape_line(line)

            if line:sub(1, 2) == "##" then
                add_text_line(document, line:sub(2), span)
            elseif line:sub(1, 1) == "#" then
                -- Comments have no runtime representation.
            elseif line == HEADER then
                add_diagnostic(
                    document,
                    "job.header.duplicate",
                    "job header may appear only once",
                    line_number
                )
            elseif escaped_directive then
                add_text_line(document, escaped_directive, span)
            elseif DirectiveSyntax.starts_line(line) then
                local operations, failure = Directive.parse_many(line, span, aliases)
                if failure then
                    add_diagnostic(
                        document,
                        failure.code,
                        failure.message,
                        line_number
                    )
                elseif operations then
                    for _, operation in ipairs(operations) do
                        add_operation(document, operation)
                    end
                end
            elseif line == "" then
                add_operation(document, { kind = "line", span = span })
            else
                add_text_line(document, line, span)
            end
        end
    end

    local block_failure = kv_block:finish()
    if block_failure then
        add_diagnostic(document, block_failure.code,
            block_failure.message, block_failure.line)
    end

    return document
end

return M
