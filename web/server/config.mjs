// Validates the private browser-preview server's fixed target and local runtime options.
import { access, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value`);
  return value;
}

export async function parseConfig(argv, root) {
  const config = { host: "127.0.0.1", port: 0, open: true, plain: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--text") config.plain = true;
    else if (token === "--no-open") config.open = false;
    else if (token === "--aliases") {
      config.aliases = resolve(requireValue(argv, index, token));
      index += 1;
    } else if (token === "--profile") {
      config.profile = resolve(requireValue(argv, index, token));
      index += 1;
    } else if (token === "--image-profile") {
      config.imageProfile = resolve(requireValue(argv, index, token));
      index += 1;
    } else if (token === "--port") {
      const raw = requireValue(argv, index, token);
      if (!/^\d+$/.test(raw) || Number(raw) > 65535) {
        throw new Error("--port must be an integer from 0 through 65535");
      }
      config.port = Number(raw);
      index += 1;
    } else if (token.startsWith("-")) throw new Error(`unknown option: ${token}`);
    else positional.push(token);
  }
  if (positional.length !== 1) throw new Error("preview expects one existing file");
  config.target = await realpath(resolve(positional[0]));
  config.root = root;
  config.aliases ||= resolve(root, "config/directives/aliases.u220a");
  config.profile ||= resolve(root, "config/printers/local.u220p");
  config.imageProfile ||= resolve(root, "config/images/default.u220i");
  await access(config.target, constants.R_OK);
  await access(config.aliases, constants.R_OK);
  await access(config.profile, constants.R_OK);
  await access(config.imageProfile, constants.R_OK);
  return config;
}
