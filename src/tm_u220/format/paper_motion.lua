-- Models physical paper displacement separately from the ESC/POS motion bytes sent to the printer.
local M = {}

local function reverse_spec(profile)
    local motion = profile.paper_motion or {}
    return motion.reverse_feed or {}
end

function M.reverse(profile, requested_vertical_units)
    local requested = math.max(0, requested_vertical_units or 0)
    local spec = reverse_spec(profile)
    local command_limit = spec.command_limit_vertical_units or requested
    local mechanism_limit = spec.mechanism_limit_vertical_units or command_limit
    local reversed = requested > command_limit
        and 0 or math.min(requested, mechanism_limit)
    local recovery = math.min(reversed, spec.recovery_vertical_units or 0)
    return {
        commanded_vertical_units = requested,
        reverse_vertical_units = reversed,
        recovery_vertical_units = recovery,
        effective_vertical_units = recovery - reversed,
    }
end

return M
