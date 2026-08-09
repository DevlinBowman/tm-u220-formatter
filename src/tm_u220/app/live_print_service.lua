-- Orchestrates compiler checkpoints into the installed local live route.
local CheckpointPlan = require("tm_u220.live.checkpoint_plan")
local Diagnostics = require("tm_u220.core.diagnostics")
local LiveRaw = require("tm_u220.transport.live_raw")

local M = {}

function M.submit(compilation, options, dependencies)
    options = options or {}
    dependencies = dependencies or {}
    local builder = dependencies.plan_builder or CheckpointPlan
    local plan = builder.build(compilation)
    if type(plan) ~= "table" then
        return nil, Diagnostics.new(
            "LIVE_PLAN_FAILED", "checkpoint planner returned an invalid result")
    end
    if Diagnostics.has_errors(plan.diagnostics) then
        return nil, plan.diagnostics[1]
    end
    local transport = dependencies.transport or LiveRaw
    if type(transport) ~= "table" or type(transport.submit) ~= "function" then
        return nil, Diagnostics.new(
            "LIVE_TRANSPORT_UNAVAILABLE", "live printer transport is unavailable")
    end
    local status_timeout = options.status_timeout_seconds
    local timeout_ms = status_timeout and status_timeout * 1000 or nil
    local submission, failure = transport.submit(plan, {
        silent = options.silent == true,
        timeout_ms = timeout_ms,
        route = options.printing_policy and options.printing_policy.routes.live or nil,
    }, dependencies.transport_dependencies)
    return submission, failure, plan
end

return M
