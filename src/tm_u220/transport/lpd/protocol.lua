local M = {}

local NUL = string.char(0)

local function copy(values)
    local result = {}
    for index, value in ipairs(values or {}) do result[index] = value end
    return result
end

local function detail(value)
    if type(value) == "table" then
        return tostring(value.message or value.kind or "session operation failed")
    end
    return tostring(value or "session operation failed")
end

local function failed(kind, message, stage, acks, bytes_written, ack)
    return {
        ok = false,
        status = kind == "nack" and "rejected" or "failed",
        failure_kind = kind,
        message = message,
        stage = stage.id,
        stage_index = stage.index,
        ack = ack,
        acks = copy(acks),
        ack_count = #acks,
        bytes_written = bytes_written,
        lpd_acceptance = kind == "nack" and "rejected" or "unknown",
        physical_outcome = "unknown",
    }
end

function M.stages(envelope)
    return {
        { id = "receive_job", bytes = string.char(2) .. envelope.queue .. "\n" },
        { id = "control_header", bytes = string.char(2) .. #envelope.control
            .. " " .. envelope.control_name .. "\n" },
        { id = "control_body", bytes = envelope.control .. NUL },
        { id = "data_header", bytes = string.char(3) .. #envelope.payload
            .. " " .. envelope.data_name .. "\n" },
        { id = "data_body", bytes = envelope.payload .. NUL },
    }
end

function M.run(envelope, session)
    if type(session) ~= "table" or type(session.write_all) ~= "function"
        or type(session.read_exact) ~= "function" then
        return {
            ok = false,
            status = "failed",
            failure_kind = "invalid_session",
            message = "LPD session must provide write_all and read_exact",
            acks = {},
            ack_count = 0,
            bytes_written = 0,
            lpd_acceptance = "unknown",
            physical_outcome = "unknown",
        }
    end

    local acks, bytes_written = {}, 0
    for index, stage in ipairs(M.stages(envelope)) do
        stage.index = index
        local called, sent, send_error = pcall(
            session.write_all, session, stage.bytes, stage.id)
        if not called then send_error, sent = sent, nil end
        if sent ~= true then
            return failed("write_failed",
                "LPD write failed at " .. stage.id .. ": " .. detail(send_error),
                stage, acks, bytes_written)
        end
        bytes_written = bytes_written + #stage.bytes

        local read_called, ack, read_error = pcall(
            session.read_exact, session, 1, stage.id)
        if not read_called then read_error, ack = ack, nil end
        if ack == nil then
            local kind = type(read_error) == "table" and read_error.kind
                or "read_failed"
            return failed(kind,
                "LPD acknowledgement failed at " .. stage.id .. ": "
                    .. detail(read_error), stage, acks, bytes_written)
        end
        if type(ack) ~= "string" or #ack ~= 1 then
            return failed("invalid_ack",
                "LPD acknowledgement at " .. stage.id
                    .. " was not exactly one byte", stage, acks, bytes_written)
        end

        local value = ack:byte(1)
        acks[#acks + 1] = value
        if value ~= 0 then
            return failed("nack", string.format(
                "LPD server rejected %s with acknowledgement 0x%02X",
                stage.id, value), stage, acks, bytes_written, value)
        end
    end

    return {
        ok = true,
        status = "accepted",
        message = "LPD server acknowledged all five submission stages",
        acks = acks,
        ack_count = #acks,
        bytes_written = bytes_written,
        lpd_acceptance = "accepted",
        physical_outcome = "unknown",
    }
end

return M
