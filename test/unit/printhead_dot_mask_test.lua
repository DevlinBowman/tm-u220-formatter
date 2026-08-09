-- Verifies compact printhead masks have canonical PBM-compatible bytes and read-only access.
local check = require("unit.support")
local DotMask = require("tm_u220.printhead.dot_mask")

local tests = {}

tests[#tests + 1] = { "packed masks expose exact MSB-first coordinates", function()
    local mask = assert(DotMask.new({
        width = 10,
        height = 2,
        data = check.bytes("80 40 00 00"),
    }))
    check.equal(mask.width, 10)
    check.equal(mask.height, 2)
    check.equal(mask.row_stride_bytes, 2)
    check.equal(mask:at(1, 1), true)
    check.equal(mask:at(10, 1), true)
    check.equal(mask:at(9, 1), false)
    check.equal(mask:at(1, 2), false)
    check.equal(mask:row_data(1), check.bytes("80 40"))
end }

tests[#tests + 1] = { "boolean rows are copied into canonical packed bytes", function()
    local rows = {
        { true, false, false, false, false, false, false, true, true },
        { false, true, false, false, false, false, true, false, false },
    }
    local mask = assert(DotMask.from_rows(rows))
    check.equal(mask.data, check.bytes("81 80 42 00"))
    rows[1][1] = false
    check.equal(mask:at(1, 1), true)
    local ok = pcall(function() mask.width = 2 end)
    check.equal(ok, false)
end }

tests[#tests + 1] = { "mask construction rejects malformed dimensions and bytes", function()
    local cases = {
        { nil, "dot mask must be a table" },
        { {}, "width must be a positive integer" },
        { { width = 8, height = 1, data = "", extra = true }, "unknown field" },
        { { width = 8, height = 1, data = "" }, "exactly 1 bytes" },
        { { width = 9, height = 1, data = check.bytes("80 01") }, "padding bits" },
    }
    for _, case in ipairs(cases) do
        local value, err = DotMask.new(case[1])
        check.equal(value, nil)
        check.contains(err, case[2])
    end
end }

tests[#tests + 1] = { "row fixtures must be dense rectangular booleans", function()
    local cases = {
        {},
        { [2] = { true } },
        { { true }, { true, false } },
        { { true, 1 } },
        { { [2] = true } },
    }
    for _, rows in ipairs(cases) do
        local mask = DotMask.from_rows(rows)
        check.equal(mask, nil)
    end
end }

tests[#tests + 1] = { "adjacency reports the first left-hand coordinate", function()
    local adjacent = assert(DotMask.from_rows({
        { true, false, false, false },
        { false, true, true, true },
    }))
    local column, row = adjacent:first_horizontal_adjacency()
    check.equal(column, 2)
    check.equal(row, 2)

    local sparse = assert(DotMask.from_rows({ { true, false, true } }))
    check.equal(sparse:first_horizontal_adjacency(), nil)

    local byte_boundary = assert(DotMask.new({
        width = 9,
        height = 1,
        data = check.bytes("01 80"),
    }))
    local boundary_column, boundary_row = byte_boundary:first_horizontal_adjacency()
    check.equal(boundary_column, 8)
    check.equal(boundary_row, 1)
end }

tests[#tests + 1] = { "coordinate reads reject values outside the mask", function()
    local mask = assert(DotMask.from_rows({ { true } }))
    for _, operation in ipairs({
        function() mask:at(0, 1) end,
        function() mask:at(1, 2) end,
        function() mask:row_data(0) end,
    }) do
        check.equal(pcall(operation), false)
    end
end }

return tests
