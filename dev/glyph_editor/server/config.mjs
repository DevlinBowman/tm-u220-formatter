// Parses the combined development workspace's fixed loopback and receipt-preview options.
// A selected receipt/profile is delegated to the ordinary preview services, never glyph persistence.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
function valueAfter(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value`);
  return value;
}

export async function parseGlyphServerConfig(argv, root) {
  const config = { host: "127.0.0.1", port: 0, open: true, help: false,
    plain: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--no-open") config.open = false;
    else if (token === "--text") config.plain = true;
    else if (token === "--help" || token === "-h") config.help = true;
    else if (token === "--profile") {
      config.profile = resolve(valueAfter(argv, index, token));
      index += 1;
    }
    else if (token === "--port") {
      const raw = valueAfter(argv, index, token);
      if (!/^\d+$/.test(raw) || Number(raw) > 65535) {
        throw new Error("--port must be an integer from 0 through 65535");
      }
      config.port = Number(raw);
      index += 1;
    } else if (token.startsWith("-")) throw new Error(`unknown option: ${token}`);
    else positional.push(token);
  }
  if (config.help && argv.length > 1) {
    throw new Error("--help cannot be combined with other options");
  }
  if (config.help) return config;
  if (positional.length > 1) throw new Error("glyph editor accepts at most one receipt file");
  config.target = resolve(positional[0] || resolve(root,
    "examples/plain_receipt.u220"));
  config.profile ||= resolve(root, "config/printers/local.u220p");
  config.root = root;
  await access(config.target, constants.R_OK | constants.W_OK);
  await access(config.profile, constants.R_OK);
  return config;
}

export const GLYPH_SERVER_USAGE = `Usage: ./dev/glyphs [RECEIPT] [options]

Open the checkout-only glyph editor and receipt preview on one loopback server.

Options:
  --profile PROFILE  Use an explicit preview profile.
  --text             Treat the receipt as plain text.
  --no-open          Print the URL without opening a browser.
  --port PORT        Use an explicit loopback port (default: automatic).
`;
