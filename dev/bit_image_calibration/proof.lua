-- Composes the synthetic calibration masks into one deterministic, raw printer proof.
-- It delegates every band and control command to the canonical packer and ESC/POS encoder.
local BitImage = require("tm_u220.printhead.bit_image")
local Encoder = require("tm_u220.escpos.encoder")
local Patterns = require("bit_image_calibration.patterns")

local M = {}

local function command(nodes, id, args)
    nodes[#nodes + 1] = { kind = "command", id = id, args = args or {} }
end

local function line(nodes, value)
    if value ~= "" then nodes[#nodes + 1] = { kind = "text", value = value } end
    command(nodes, "print.line_feed")
end

local function encode_error(result)
    local diagnostic = result.diagnostics and result.diagnostics[1]
    return diagnostic and diagnostic.message or "calibration proof encoding failed"
end

function M.build()
    local nodes = {}
    local plans = {}
    command(nodes, "control.initialize")
    line(nodes, "TM-U220 BIT-IMAGE CALIBRATION")
    line(nodes, "CANONICAL PACKER / ENCODER PROOF")
    line(nodes, "")

    for _, pattern in ipairs(Patterns.all()) do
        line(nodes, pattern.label)
        local plan, err = BitImage.pack(pattern.mask, { mode = pattern.mode })
        if not plan then return nil, pattern.id .. ": " .. err end
        plans[pattern.id] = plan

        if pattern.unidirectional then
            command(nodes, "printhead.unidirectional", { enabled = true })
        end
        for _, band in ipairs(plan.bands) do
            command(nodes, "printhead.bit_image", band.command_args)
            command(nodes, "print.feed_units", {
                vertical_units = band.feed_vertical_units,
            })
        end
        if pattern.unidirectional then
            command(nodes, "printhead.unidirectional", { enabled = false })
        end
        line(nodes, pattern.expectation)
        line(nodes, "")
    end

    line(nodes, "END OF PROOF")
    for _ = 1, 4 do line(nodes, "") end

    local encoded = Encoder.encode(nodes)
    if not encoded.bytes then return nil, encode_error(encoded) end
    return {
        bytes = encoded.bytes,
        nodes = nodes,
        parts = encoded.parts,
        plans = plans,
    }
end

return M
