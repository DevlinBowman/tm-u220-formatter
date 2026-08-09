-- Emits the deterministic TM-U220 calibration proof as raw bytes or reviewable hexadecimal.
-- Explicit output selection prevents control bytes from reaching a terminal accidentally.
local script = arg and arg[0] or "dev/bit_image_calibration/generate.lua"
local root = script:match("^(.*)dev/bit_image_calibration/generate%.lua$") or "."
root = root:gsub("/$", "")
if root == "" then root = "." end
package.path = root .. "/src/?.lua;" .. root .. "/src/?/init.lua;"
    .. root .. "/dev/?.lua;" .. root .. "/dev/?/init.lua;" .. package.path

local Bytes = require("tm_u220.core.bytes")
local Proof = require("bit_image_calibration.proof")

local mode = arg and arg[1]
if (mode ~= "--raw" and mode ~= "--hex") or arg[2] ~= nil then
    io.stderr:write("usage: lua dev/bit_image_calibration/generate.lua --raw|--hex\n")
    os.exit(2)
end

local fixture, err = Proof.build()
if not fixture then
    io.stderr:write("bit-image calibration: " .. err .. "\n")
    os.exit(1)
end

if mode == "--hex" then
    io.write(Bytes.to_hex(fixture.bytes), "\n")
else
    io.write(fixture.bytes)
end
