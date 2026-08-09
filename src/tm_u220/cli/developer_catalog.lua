-- Declares checkout-only developer commands without exposing internal flat spellings.
-- Runtime availability remains enforced by each developer application service.
local M = {}

M.definitions = {
    { name = "dev-glyphs", usage = "dev-glyphs",
        summary = "Open the checkout-only glyph editor and receipt preview.",
        arguments = 0, options = {}, flat = false, notes = {
            "This command is available only from a source checkout.",
            "Use ./dev/glyphs directly for advanced receipt and server options.",
        } },
}

M.group = {
    summary = "Checkout-only developer commands",
    legacy_flat = false,
    order = { { "glyphs", "dev-glyphs" } },
}

return M
