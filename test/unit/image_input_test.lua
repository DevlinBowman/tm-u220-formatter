-- Verifies direct image recognition is magic-based and derives only a companion filename.
-- Decoding and path authorization remain separate application boundaries.
local check = require("unit.support")
local ImageInput = require("tm_u220.app.image_input")

local tests = {}

tests[#tests + 1] = { "supported image signatures are detected without extensions", function()
    check.equal(ImageInput.detect("\137PNG\r\n\26\nrest"), "png")
    check.equal(ImageInput.detect("P4\n1 1\n\0"), "pbm")
    check.equal(ImageInput.detect("!tm-u220 job 1\n"), nil)
end }

tests[#tests + 1] = { "direct image paths reduce to one relative filename", function()
    check.equal(ImageInput.reference("test/assets/Chicken.png"), "Chicken.png")
    check.equal(ImageInput.reference("Chicken.png"), "Chicken.png")
    check.equal(ImageInput.reference("-"), nil)
end }

tests[#tests + 1] = { "direct image inputs normalize to one image-only document", function()
    local document = ImageInput.document({
        image_reference = "Chicken.png", image_format = "png",
    })
    check.equal(document.version, 1)
    check.equal(#document.diagnostics, 0)
    check.equal(#document.ops, 1)
    check.equal(document.ops[1].kind, "image")
    check.equal(document.ops[1].path, "Chicken.png")
    check.equal(document.ops[1].image_format, "png")
    check.equal(document.ops[1].direct_image, true)
end }

return tests
