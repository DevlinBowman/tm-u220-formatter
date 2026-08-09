-- Verifies the printable calibration fixture covers each physical mode with exact canonical bands.
-- The completed byte stream must also survive parser/encoder round-trip without hidden controls.
local script = arg and arg[0] or "test/run.lua"
local root = script:match("^(.*)/test/run%.lua$") or "."
if root == "" then root = "." end
package.path = root .. "/dev/?.lua;" .. root .. "/dev/?/init.lua;" .. package.path

local check = require("unit.support")
local Encoder = require("tm_u220.escpos.encoder")
local Parser = require("tm_u220.escpos.parser")
local Proof = require("bit_image_calibration.proof")

local tests = {}

local function registration_band(nonrail)
    local rails = { [1] = true, [32] = true, [64] = true, [96] = true }
    local out = {}
    for x = 1, 96 do out[x] = string.char(rails[x] and 0xFF or nonrail) end
    return table.concat(out)
end

tests[#tests + 1] = { "calibration plans cover pin order and both legal densities", function()
    local fixture = assert(Proof.build())
    local plans = fixture.plans

    local order = {}
    for bit = 7, 0, -1 do order[#order + 1] = string.char(1 << bit):rep(4) end
    check.equal(plans.bit_order.bands[1].command_args.data, table.concat(order))
    check.equal(plans.bit_order.bands[1].command_args.mode, "single_density")

    local solid = plans.single_density_solid.bands[1].command_args
    check.equal(solid.mode, "single_density")
    check.equal(solid.data, string.char(0xFF):rep(64))

    local detail = plans.double_density_alternation.bands[1].command_args
    check.equal(detail.mode, "double_density")
    check.equal(detail.data, (string.char(0xAA, 0x55)):rep(48))
end }

tests[#tests + 1] = { "registration proof emits two touching bands with straight rails", function()
    local plan = assert(Proof.build()).plans.two_band_registration
    check.equal(#plan.bands, 2)
    check.equal(plan.feed_vertical_units_per_band, 16)
    check.equal(plan.bands[1].command_args.data, registration_band(0x80))
    check.equal(plan.bands[2].command_args.data, registration_band(0x01))
end }

tests[#tests + 1] = { "raw proof is deterministic and command-framed end to end", function()
    local fixture = assert(Proof.build())
    check.equal(assert(Proof.build()).bytes, fixture.bytes)
    local parsed = Parser.parse(fixture.bytes)
    check.equal(#parsed.diagnostics, 0)

    local images, directions = {}, {}
    local image_positions, direction_positions = {}, {}
    for index, node in ipairs(parsed.nodes) do
        if node.id == "printhead.bit_image" then
            images[#images + 1] = node
            image_positions[#image_positions + 1] = index
            local feed = parsed.nodes[index + 1]
            check.equal(feed.id, "print.feed_units")
            check.equal(feed.args.vertical_units, 16)
        elseif node.id == "printhead.unidirectional" then
            directions[#directions + 1] = node.args.enabled
            direction_positions[#direction_positions + 1] = index
        end
        check.falsy(node.id == "mechanism.cut", "calibration proof must not cut paper")
        check.falsy(node.id == "motion.line_spacing",
            "calibration proof must not change line spacing")
        check.falsy(node.id == "motion.default_line_spacing",
            "calibration proof must not restore unchanged line spacing")
    end
    check.equal(#images, 5)
    check.equal(images[1].args.width_dots, 32)
    check.equal(images[2].args.width_dots, 64)
    check.equal(images[3].args.width_dots, 96)
    check.equal(images[3].args.mode, "double_density")
    check.equal(images[4].args.width_dots, 96)
    check.equal(images[5].args.width_dots, 96)
    check.equal(#directions, 2)
    check.equal(directions[1], true)
    check.equal(directions[2], false)
    check.truthy(direction_positions[1] < image_positions[4])
    check.truthy(direction_positions[2] > image_positions[5])

    local reencoded = Encoder.encode(parsed.nodes)
    check.equal(#reencoded.diagnostics, 0)
    check.equal(reencoded.bytes, fixture.bytes)
end }

return tests
