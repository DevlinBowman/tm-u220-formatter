local Protocol = require("tm_u220.transport.lpd.protocol")

local M = {}

local function detail(value)
    if type(value) == "table" then
        return tostring(value.message or value.stderr or value.kind or "connection failed")
    end
    return tostring(value or "connection failed")
end

local function bind_collision(failure)
    return type(failure) == "table" and failure.kind == "bind_in_use"
        and failure.connected == false and failure.bytes_sent == 0
end

local function close(session)
    if type(session.close) ~= "function" then return nil end
    local called, closed, failure = pcall(session.close, session)
    if not called then return tostring(closed) end
    if closed == false or closed == nil then return detail(failure) end
    return nil
end

function M.run(envelope, endpoint, options, adapter, runtime)
    for index, source_port in ipairs(options.source_ports) do
        if source_port == false then source_port = nil end
        local called, session, failure = pcall(adapter.open, endpoint, {
            timeout = options.timeout,
            source_port = source_port,
            sudo = options.sudo,
        }, runtime)
        if not called then
            return { ok = false, code = "LPD_CONNECT_FAILED",
                message = "LPD session adapter failed: " .. tostring(session),
                source_port = source_port }
        end
        if not session then
            if bind_collision(failure) and index < #options.source_ports then
                -- Confirmed local failure: no remote bytes could have been sent.
            else
                return { ok = false, code = "LPD_CONNECT_FAILED",
                    message = "LPD connection failed: " .. detail(failure),
                    source_port = source_port }
            end
        else
            local result = Protocol.run(envelope, session)
            local close_error = close(session)
            if not result.ok then
                return {
                    ok = false,
                    code = result.failure_kind == "nack"
                        and "LPD_REJECTED" or "LPD_SESSION_FAILED",
                    message = result.message,
                    source_port = source_port,
                    stage = result.stage,
                    ack = result.ack,
                    ack_count = result.ack_count,
                    lpd_acceptance = result.lpd_acceptance,
                }
            end
            return {
                ok = true,
                source_port = source_port,
                protocol_bytes_written = result.bytes_written,
                acks = result.acks,
                ack_count = result.ack_count,
                close_error = close_error,
            }
        end
    end
end

return M
