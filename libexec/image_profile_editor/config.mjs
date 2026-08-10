// Resolves one fixed source image, printer profile, and safely editable image profile.
// Browser requests cannot choose or replace any of these filesystem targets.
import fs from "node:fs";
import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import path from "node:path";
import { configurationFiles } from "../configuration/paths.mjs";
import { configurationIsManaged } from "../configuration/release.mjs";
import { prepareConfiguration } from "../configuration/store.mjs";

function valueAfter(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value`);
  return value;
}

export async function parseEditorConfig(argv, root, options = {}) {
  const config = { host: "127.0.0.1", port: 0, open: true };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--no-open") config.open = false;
    else if (token === "--profile") {
      config.profile = path.resolve(valueAfter(argv, index, token));
      index += 1;
    } else if (token === "--port") {
      const raw = valueAfter(argv, index, token);
      if (!/^\d+$/u.test(raw) || Number(raw) > 65535) {
        throw new Error("--port must be an integer from 0 through 65535");
      }
      config.port = Number(raw);
      index += 1;
    } else if (token.startsWith("-")) throw new Error(`unknown option: ${token}`);
    else positional.push(token);
  }
  if (positional.length !== 1 || !config.profile) {
    throw new Error("image-profile editor requires one image and --profile");
  }

  const runtime = options.runtime || fs;
  const uid = options.uid ?? process.getuid?.();
  if (!Number.isInteger(uid) || uid < 1) {
    throw new Error("run 220 image-profile as your normal user, not root or sudo");
  }
  const managed = configurationIsManaged(root, runtime);
  const files = configurationFiles(root, options.environment || process.env, managed);
  const imageProfile = files.find((file) => file.name === "image_profile");
  [config.imageProfile] = prepareConfiguration([imageProfile], { runtime, uid });
  config.target = await realpath(path.resolve(positional[0]));
  config.profile = await realpath(config.profile);
  config.imageProfile = await realpath(config.imageProfile);
  config.root = root;
  await access(config.target, constants.R_OK);
  await access(config.profile, constants.R_OK);
  await access(config.imageProfile, constants.R_OK | constants.W_OK);
  return config;
}
