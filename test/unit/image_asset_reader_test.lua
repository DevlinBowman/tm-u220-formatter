-- Verifies Lua accepts only exact raw-image and decoded-grayscale helper protocols.
-- Filesystem security and PNG syntax are exercised independently at the Node boundary.
local check = require("unit.support")
local Reader = require("tm_u220.app.image_asset_reader")

local tests = {}

tests[#tests + 1] = { "asset reader forwards fixed arguments and preserves binary bytes", function()
    local received
    local bytes = assert(Reader.read("receipt.u220", "art/pixel.pbm", 1024, {
        capture = function(spec)
            received = spec
            return "U220ASSET1\nP4\n1 1\n\0"
        end,
    }))
    check.equal(received.executable, "node")
    check.contains(received.arguments[1], "libexec/image_assets/read.mjs")
    check.equal(received.arguments[2], "receipt.u220")
    check.equal(received.arguments[3], "art/pixel.pbm")
    check.equal(received.arguments[4], "1024")
    check.equal(bytes, "P4\n1 1\n\0")
end }

tests[#tests + 1] = { "asset reader rejects helper errors and malformed protocols", function()
    local bytes, failure = Reader.read("receipt.u220", "bad.pbm", 10, {
        capture = function() return "U220ERROR1\nLINK_REJECTED\n" end,
    })
    check.equal(bytes, nil)
    check.equal(failure, "LINK_REJECTED")

    bytes, failure = Reader.read("receipt.u220", "bad.pbm", 10, {
        capture = function() return "surprise" end,
    })
    check.equal(bytes, nil)
    check.equal(failure, "READ_FAILED")

    bytes, failure = Reader.read("receipt.u220", "bad.pbm", 10, {
        capture = function() return "U220ERROR1\nLINK_REJECTED\ntrailing" end,
    })
    check.equal(bytes, nil)
    check.equal(failure, "READ_FAILED")
end }

tests[#tests + 1] = { "image materializer accepts exact raw and grayscale payloads", function()
    local raw = assert(Reader.read_image("receipt.u220", "art/pixel.pbm", 1024, {
        capture = function(spec)
            check.contains(spec.arguments[1], "libexec/image_assets/materialize.mjs")
            return "U220ASSET1\nP4\n1 1\n\128"
        end,
    }))
    check.equal(raw.kind, "bytes")
    check.equal(raw.source_bytes, 8)
    check.equal(raw.data, "P4\n1 1\n\128")

    local gray = assert(Reader.read_image("receipt.u220", "art/photo.png", 1024, {
        capture = function() return "U220GRAY1\n2 2 99\n\0\64\128\255" end,
    }))
    check.equal(gray.kind, "grayscale")
    check.equal(gray.width, 2)
    check.equal(gray.height, 2)
    check.equal(gray.source_bytes, 99)
    check.equal(gray.data, "\0\64\128\255")

    local rooted = assert(Reader.read_root_image(".", "art/pixel.pbm", 1024, {
        capture = function(spec)
            check.equal(spec.arguments[2], ".")
            check.equal(spec.arguments[5], "root")
            return "U220ASSET1\nP4\n1 1\n\128"
        end,
    }))
    check.equal(rooted.kind, "bytes")
end }

tests[#tests + 1] = { "image materializer rejects malformed grayscale envelopes", function()
    for _, output in ipairs({
        "U220GRAY1\n02 2 9\n\0\0\0\0",
        "U220GRAY1\n2 2 9\n\0\0\0",
        "U220GRAY1\n2 2 2048\n\0\0\0\0",
        "U220GRAY1\n2 2\n\0\0\0\0",
        "U220GRAY1\n4097 1 9\n" .. string.rep("\0", 4097),
    }) do
        local value, failure = Reader.read_image("receipt.u220", "bad.png", 1024, {
            capture = function() return output end,
        })
        check.equal(value, nil)
        check.equal(failure, "READ_FAILED")
    end
    local value, failure = Reader.read_image("receipt.u220", "bad.png", 1024, {
        capture = function() return "U220ERROR1\nPNG_INVALID\n" end,
    })
    check.equal(value, nil)
    check.equal(failure, "PNG_INVALID")

    for _, output in ipairs({ "U220ASSET1\n", "U220ASSET1\n12345678901" }) do
        value, failure = Reader.read_image("receipt.u220", "bad.pbm", 10, {
            capture = function() return output end,
        })
        check.equal(value, nil)
        check.equal(failure, "READ_FAILED")
    end
end }

return tests
