-- Exercises PBM, PNG, and JPEG through safe materialization, preview, ESC/POS, and checkpoints.
-- Tiny fixtures prove exact bytes while Chicken.png is the real direct-image acceptance case.
local check = require("unit.support")
local Jobs = require("tm_u220.app.job_service")
local LivePlan = require("tm_u220.live.checkpoint_plan")
local Preview = require("tm_u220.render.preview")
local Sha256 = require("tm_u220.core.sha256")

local tests = {}
local PROFILE = { variant = "B", paper = 76, dip2_1 = false, cutter = "partial" }
local BLACK_PIXEL = "P4\n1 1\n" .. string.char(0x80)

local function compile(source, overrides)
    local options = {
        profile = PROFILE,
        image_profile = { fit = "stretch" },
        document_path = "/jobs/receipt.u220",
        read_asset = function(_, reference)
            check.equal(reference, "art/pixel.pbm")
            return BLACK_PIXEL
        end,
    }
    for key, value in pairs(overrides or {}) do options[key] = value end
    return Jobs.compile_content(source, options)
end

local function has_code(result, code)
    for _, item in ipairs(result.diagnostics or {}) do
        if item.code == code then return item end
    end
end

tests[#tests + 1] = { "PBM image compiles into exact bands and trailing gap", function()
    local result = compile("@image art/pixel.pbm 1 1")
    check.equal(#result.diagnostics, 0)
    check.equal(result.bytes, check.bytes(
        "1B 40 1B 55 01 "
        .. "1B 2A 00 05 00 FF FF FF FF FF 1B 4A 10 "
        .. "1B 2A 00 05 00 80 80 80 80 80 1B 4A 10 "
        .. "1B 4A 04 1B 55 00"))
    check.equal(#result.preview_lines, 1)
    local line = result.preview_lines[1]
    local segment = line.segments[1]
    check.equal(line.kind, "image")
    check.equal(line.image_label, "art/pixel.pbm")
    check.equal(segment.mask_encoding, "hex-msb-rows")
    check.equal(segment.mask_width_dots, 5)
    check.equal(segment.mask_height_dots, 9)
    check.equal(segment.mask_data, "F8F8F8F8F8F8F8F8F8")
    check.equal(result.paper_preview.max_y_vertical_units, 36)
    check.contains(Preview.render(result),
        "[image art/pixel.pbm, 5x9 dots, solid]")
end }

tests[#tests + 1] = { "image alignment and following text share compiler paper geometry", function()
    local result = compile(table.concat({
        "@align center", "@image art/pixel.pbm 1 1", "AFTER",
    }, "\n"))
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].x_offset_half_dots, 195)
    check.equal(result.preview_lines[1].y_vertical_units, 0)
    check.equal(result.preview_lines[2].text, "AFTER")
    check.equal(result.preview_lines[2].y_vertical_units, 36)
end }

tests[#tests + 1] = { "first image band maps the preview line in live mode", function()
    local result = compile("@image art/pixel.pbm 1 1")
    local plan = LivePlan.build(result)
    check.equal(#plan.diagnostics, 0)
    check.equal(#plan.steps, 4)
    check.equal(plan.steps[1].preview_line_index, 1)
    check.equal(plan.steps[1].action.reason, "image_band")
    check.equal(plan.steps[2].preview_line_index, nil)
    check.equal(plan.steps[3].action.reason, "image_trailing_gap")
    check.equal(plan.steps[4].kind, "control")
    local bytes = {}
    for index, step in ipairs(plan.steps) do bytes[index] = step.payload_bytes end
    check.equal(table.concat(bytes), result.bytes)
end }

tests[#tests + 1] = { "inline images fail without an implicit working-directory base", function()
    local result = compile("@image art/pixel.pbm 1 1", { document_path = false })
    check.equal(result.bytes, nil)
    check.truthy(has_code(result, "IMAGE_ASSET_BASE_REQUIRED"))
end }

tests[#tests + 1] = { "an explicit asset root materializes inline image source", function()
    local result = Jobs.compile_content('@image "test/assets/Chicken.png" 20 10', {
        profile = PROFILE,
        image_profile = {},
        asset_root = ".",
    })
    check.equal(#result.diagnostics, 0)
    check.equal(result.preview_lines[1].segments[1].mask_width_dots, 100)
    check.equal(result.preview_lines[1].segments[1].mask_height_dots, 90)
end }

tests[#tests + 1] = { "invalid assets and table placement fail before printer output", function()
    local invalid = compile("@image art/pixel.pbm 1 1", {
        read_asset = function() return "not a PBM" end,
    })
    check.equal(invalid.bytes, nil)
    check.truthy(has_code(invalid, "IMAGE_ASSET_INVALID"))

    local invalid_jpeg = Jobs.compile_content("@image art/bad.jpg", {
        profile = PROFILE,
        image_profile = {},
        document_path = "/jobs/receipt.u220",
        image_asset_reader_runtime = {
            capture = function() return "U220ERROR1\nJPEG_INVALID\n" end,
        },
    })
    check.equal(invalid_jpeg.bytes, nil)
    check.contains(has_code(invalid_jpeg, "IMAGE_ASSET_INVALID").message,
        "cannot decode @image JPEG art/bad.jpg")

    local oversized = Jobs.compile_content("@image art/huge.jpg", {
        profile = PROFILE,
        image_profile = {},
        document_path = "/jobs/receipt.u220",
        image_asset_reader_runtime = {
            capture = function() return "U220ERROR1\nSIZE_INVALID\n" end,
        },
    })
    check.equal(oversized.bytes, nil)
    check.contains(has_code(oversized, "IMAGE_ASSET_SIZE_INVALID").message,
        "between 1 byte and 1 MiB")

    local inside = compile(table.concat({
        "@table 5", "@image art/pixel.pbm 1 1", "@end-table",
    }, "\n"))
    check.equal(inside.bytes, nil)
    check.truthy(has_code(inside, "FORMAT_IMAGE_IN_TABLE"))
end }

tests[#tests + 1] = { "combined source pixels are bounded before formatting", function()
    local large = "P4\n2048 1024\n" .. string.rep("\0", 256 * 1024)
    local result = compile(table.concat({
        "@image one.pbm", "@image two.pbm", "@image three.pbm",
    }, "\n"), {
        read_asset = function() return large end,
    })
    check.equal(result.bytes, nil)
    check.truthy(has_code(result, "IMAGE_ASSET_TOTAL_PIXELS_EXCEEDED"))
end }

tests[#tests + 1] = { "a PBM file is a direct image job instead of binary text", function()
    local path = os.tmpname() .. ".pbm"
    local file = assert(io.open(path, "wb"))
    assert(file:write(BLACK_PIXEL))
    assert(file:close())
    local ok, result = pcall(Jobs.compile_input, path, {
        profile = PROFILE,
        image_profile = { fit = "stretch" },
    })
    os.remove(path)
    if not ok then error(result) end
    check.equal(#result.diagnostics, 0)
    check.equal(result.input_kind, "image")
    check.equal(result.document.ops[1].path, path:match("([^/]+)$"))
    check.equal(result.preview_lines[1].kind, "image")
    check.truthy(result.bytes)
end }

local function bytes_from_hex(value)
    local out = {}
    for pair in value:gmatch("%x%x") do out[#out + 1] = string.char(tonumber(pair, 16)) end
    return table.concat(out)
end

tests[#tests + 1] = { "Chicken.png compiles directly through the default image profile", function()
    local result = Jobs.compile_input("test/assets/Chicken.png", {
        profile = PROFILE,
        image_profile = {},
    })
    check.equal(#result.diagnostics, 0)
    check.equal(result.input_kind, "image")
    check.equal(result.document.ops[1].path, "Chicken.png")
    check.equal(result.document.ops[1].image_format, "png")
    check.equal(result.document.ops[1].direct_image, true)

    local line = result.preview_lines[1]
    local segment = line.segments[1]
    check.equal(line.kind, "image")
    check.equal(line.image_label, "Chicken.png")
    check.equal(segment.mask_encoding, "hex-msb-rows")
    check.equal(segment.mask_width_dots, 200)
    check.equal(segment.mask_height_dots, 126)
    check.equal(segment.column_step_half_dots, 2)
    check.equal(#segment.mask_data, 6300)
    check.equal(Sha256.hex(bytes_from_hex(segment.mask_data)),
        "57e7f56d8ef5b7aa044976e74f4947c2db59863d6ffab6ce691bca417f50dcf5")
    check.equal(result.paper_preview.max_y_vertical_units, 260)
    check.equal(#result.bytes, 3339)
    check.equal(Sha256.hex(result.bytes),
        "ad6cdea5a225629386a2a2ab0e7c5c81392493578669ad9120e9fa3b487f4e4d")
end }

tests[#tests + 1] = { "JPEG compiles directly and as a companion image", function()
    local result = Jobs.compile_input("test/assets/jpeg/color-grid-7x5.jpg", {
        profile = PROFILE,
        image_profile = {},
    })
    check.equal(#result.diagnostics, 0)
    check.equal(result.input_kind, "image")
    check.equal(result.document.ops[1].image_format, "jpeg")

    local segment = result.preview_lines[1].segments[1]
    check.equal(segment.mask_width_dots, 200)
    check.equal(segment.mask_height_dots, 129)
    check.equal(#segment.mask_data, 6450)
    check.equal(Sha256.hex(bytes_from_hex(segment.mask_data)),
        "137e6175ceec51227b193db50c5b7f259899b2d15ae9686844e444a90b8fe045")
    check.equal(result.paper_preview.max_y_vertical_units, 276)
    check.equal(#result.bytes, 3547)
    check.equal(Sha256.hex(result.bytes),
        "43ec7cbe59622caabef3927fc89fcb25639a755d970653043ebfc806e7a723e5")

    local companion = Jobs.compile_content(
        '@image "test/assets/jpeg/color-grid-7x5.jpg" 20 10', {
            profile = PROFILE,
            image_profile = {},
            asset_root = ".",
        })
    check.equal(#companion.diagnostics, 0)
    check.equal(companion.preview_lines[1].segments[1].mask_width_dots, 100)
    check.equal(companion.preview_lines[1].segments[1].mask_height_dots, 90)
end }

return tests
