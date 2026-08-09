-- Verifies TM-U220 bit-image bands preserve pin order, density limits, and detail-mode safety.
local check = require("unit.support")
local BitImage = require("tm_u220.printhead.bit_image")
local DotMask = require("tm_u220.printhead.dot_mask")

local tests = {}

local function row(width, active)
    local values = {}
    for column = 1, width do values[column] = active[column] == true end
    return values
end

tests[#tests + 1] = { "bands pack top-to-bottom pins and pad the final band", function()
    local rows = {}
    for index = 1, 9 do rows[index] = row(3, {}) end
    rows[1][1] = true
    rows[2][2] = true
    rows[8][3] = true
    rows[9][1] = true
    local plan = assert(BitImage.pack(assert(DotMask.from_rows(rows)), { mode = "solid" }))

    check.equal(plan.command_mode, "single_density")
    check.equal(plan.horizontal_density_dpi, 80)
    check.equal(plan.vertical_density_dpi, 72)
    check.equal(plan.column_step_half_dots, 2)
    check.equal(plan.width_dots, 3)
    check.equal(plan.height_dots, 9)
    check.equal(plan.printed_height_dots, 16)
    check.equal(#plan.bands, 2)
    check.equal(plan.bands[1].command_args.data, check.bytes("80 40 01"))
    check.equal(plan.bands[2].command_args.data, check.bytes("80 00 00"))
    check.equal(plan.bands[2].row_first, 9)
    check.equal(plan.bands[2].row_count, 1)
    check.equal(plan.bands[2].feed_vertical_units, 16)
end }

tests[#tests + 1] = { "band command arguments match the ESC star command boundary", function()
    local mask = assert(DotMask.from_rows({ { true, false, true } }))
    local plan = assert(BitImage.pack(mask, { mode = "detail" }))
    local args = plan.bands[1].command_args
    check.equal(args.mode, "double_density")
    check.equal(args.width_dots, 3)
    check.equal(args.data, check.bytes("80 00 80"))
    check.equal(#args.data, args.width_dots)
end }

tests[#tests + 1] = { "solid permits adjacent strikes while detail rejects them", function()
    local mask = assert(DotMask.from_rows({ { true, true } }))
    local solid = assert(BitImage.pack(mask, { mode = "solid" }))
    check.equal(solid.bands[1].command_args.data, check.bytes("80 80"))

    local detail, err = BitImage.pack(mask, { mode = "detail" })
    check.equal(detail, nil)
    check.contains(err, "row 1, columns 1 and 2")
end }

tests[#tests + 1] = { "profile-specific column limits can narrow each physical mode", function()
    local mask = assert(DotMask.from_rows({ row(193, {}) }))
    local value, err = BitImage.pack(mask, { mode = "solid", maximum_columns = 192 })
    check.equal(value, nil)
    check.contains(err, "193 columns wide; maximum is 192")

    local accepted = assert(BitImage.pack(mask, { mode = "solid", maximum_columns = 200 }))
    check.equal(accepted.width_dots, 193)
end }

tests[#tests + 1] = { "mode and option contracts reject unsupported values", function()
    local mask = assert(DotMask.from_rows({ { false } }))
    local cases = {
        { "bad input", "options must be a table" },
        { false, "options must be a table" },
        { { mode = "photo" }, "solid or detail" },
        { { mode = false }, "solid or detail" },
        { { mode = "solid", extra = true }, "unknown field" },
        { { maximum_columns = false }, "1 through 200" },
        { { mode = "solid", maximum_columns = 201 }, "1 through 200" },
        { { mode = "detail", maximum_columns = 401 }, "1 through 400" },
    }
    for _, case in ipairs(cases) do
        local value, err = BitImage.pack(mask, case[1])
        check.equal(value, nil)
        check.contains(err, case[2])
    end
    local value, err = BitImage.pack({}, {})
    check.equal(value, nil)
    check.contains(err, "must be a dot mask")
end }

tests[#tests + 1] = { "physical mode maxima are enforced when no profile narrows them", function()
    local wide_solid = assert(DotMask.from_rows({ row(201, {}) }))
    local solid, solid_err = BitImage.pack(wide_solid, { mode = "solid" })
    check.equal(solid, nil)
    check.contains(solid_err, "maximum is 200")

    local wide_detail = assert(DotMask.from_rows({ row(401, {}) }))
    local detail, detail_err = BitImage.pack(wide_detail, { mode = "detail" })
    check.equal(detail, nil)
    check.contains(detail_err, "maximum is 400")
end }

tests[#tests + 1] = { "banding does not impose an interpretation height policy", function()
    local mask = assert(DotMask.new({
        width = 1,
        height = 4097,
        data = string.rep("\0", 4097),
    }))
    local plan = assert(BitImage.pack(mask))
    check.equal(#plan.bands, 513)
    check.equal(plan.bands[513].row_first, 4097)
    check.equal(plan.bands[513].row_count, 1)
end }

return tests
