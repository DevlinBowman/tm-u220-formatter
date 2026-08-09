-- Computes SHA-256 locally so installed profile bytes can be verified before compilation.
-- This small implementation uses Lua's standard integer bitwise operations and no process shell.
local M = {}

local MASK = 0xffffffff
local K = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}

local function rotate(value, amount)
    return ((value >> amount) | (value << (32 - amount))) & MASK
end

local function padded(value)
    local length = #value
    local zeroes = (56 - ((length + 1) % 64)) % 64
    local bits = length * 8
    local high, low = math.floor(bits / 0x100000000), bits & MASK
    return value .. "\128" .. string.rep("\0", zeroes) .. string.pack(">I4I4", high, low)
end

function M.hex(value)
    assert(type(value) == "string", "SHA-256 input must be a byte string")
    local h = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    }
    local source, words = padded(value), {}
    for offset = 1, #source, 64 do
        for index = 0, 15 do
            words[index] = string.unpack(">I4", source, offset + index * 4)
        end
        for index = 16, 63 do
            local first = words[index - 15]
            local second = words[index - 2]
            local s0 = rotate(first, 7) ~ rotate(first, 18) ~ (first >> 3)
            local s1 = rotate(second, 17) ~ rotate(second, 19) ~ (second >> 10)
            words[index] = (words[index - 16] + s0 + words[index - 7] + s1) & MASK
        end
        local a, b, c, d, e, f, g, last = table.unpack(h)
        for index = 0, 63 do
            local s1 = rotate(e, 6) ~ rotate(e, 11) ~ rotate(e, 25)
            local choose = (e & f) ~ ((~e) & g)
            local first = (last + s1 + choose + K[index + 1] + words[index]) & MASK
            local s0 = rotate(a, 2) ~ rotate(a, 13) ~ rotate(a, 22)
            local majority = (a & b) ~ (a & c) ~ (b & c)
            local second = (s0 + majority) & MASK
            last, g, f, e, d, c, b, a = g, f, e, (d + first) & MASK,
                c, b, a, (first + second) & MASK
        end
        for index, value_part in ipairs({ a, b, c, d, e, f, g, last }) do
            h[index] = (h[index] + value_part) & MASK
        end
    end
    local out = {}
    for index, value_part in ipairs(h) do out[index] = string.format("%08x", value_part) end
    return table.concat(out)
end

return M
