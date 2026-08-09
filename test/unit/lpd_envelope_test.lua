local check = require("unit.support")
local Envelope = require("tm_u220.transport.lpd.envelope")

local tests = {}

tests[#tests + 1] = { "LPD envelope preserves binary payload and exact control bytes", function()
    local payload = string.char(0x1B, 0x40, 0x00, 0x41, 0x0A)
    local envelope = assert(Envelope.build(payload, {
        queue = "lp",
        client_host = "register-1",
        user = "operator",
        source_name = "receipt.bin",
        job_id = 7,
    }))
    local data_name = "dfA007register-1"
    local expected = "Hregister-1\nPoperator\nl" .. data_name .. "\nU"
        .. data_name .. "\nNreceipt.bin\n"

    check.equal(envelope.control_name, "cfA007register-1")
    check.equal(envelope.data_name, data_name)
    check.equal(envelope.control, expected)
    check.equal(envelope.control:sub(-1), "\n")
    check.equal(envelope.control_size, #expected)
    check.equal(envelope.payload, payload)
    check.equal(envelope.payload_size, #payload)
end }

tests[#tests + 1] = { "LPD envelope uses literal unfiltered data directive", function()
    local envelope = assert(Envelope.build("DATA", {
        client_host = "host", user = "user", job_id = 42,
    }))
    check.contains(envelope.control, "\nldfA042host\n")
    check.falsy(envelope.control:find("\nfdfA", 1, true))
end }

tests[#tests + 1] = { "LPD envelope rejects control-file injection and bad identity", function()
    local cases = {
        { { queue = "lp\nother", client_host = "host", user = "user", job_id = 1 },
            "queue" },
        { { client_host = "host\nPattacker", user = "user", job_id = 1 },
            "client host" },
        { { client_host = "host", user = "1user", job_id = 1 },
            "must not start" },
        { { client_host = "host", user = "user", source_name = "x\nUfile",
            job_id = 1 }, "source name" },
        { { client_host = "host", user = "user", job_id = 1000 }, "job id" },
    }
    for _, case in ipairs(cases) do
        local value, err = Envelope.build("X", case[1])
        check.equal(value, nil)
        check.contains(err, case[2])
    end

    local value, err = Envelope.build("", {
        client_host = "host", user = "user", job_id = 1,
    })
    check.equal(value, nil)
    check.contains(err, "empty")
end }

return tests
