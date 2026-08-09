-- Publishes the native U220 job parser as the job-domain boundary.
local Parser = require("tm_u220.job.parser")

local M = {}

M.parse = Parser.parse

return M
