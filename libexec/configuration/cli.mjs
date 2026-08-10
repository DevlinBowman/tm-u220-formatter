// Orchestrates terminal checks, release-mode path selection, safe seeding, and Vim editing.
// It performs no work until the invoking account and interactive terminal are verified.
import fs from "node:fs";
import path from "node:path";
import { configurationFiles } from "./paths.mjs";
import { configurationIsManaged } from "./release.mjs";
import { prepareConfiguration } from "./store.mjs";
import { openInVim } from "./editor.mjs";

function assertInvocation(options) {
  const platform = options.platform || process.platform;
  const uid = options.uid ?? process.getuid?.();
  if (platform !== "darwin") throw new Error("220 config is available only on macOS");
  if (!Number.isInteger(uid) || uid < 1) {
    throw new Error("run 220 config as your normal user, not root or sudo");
  }
  if (options.stdinIsTTY !== true || options.stdoutIsTTY !== true) {
    throw new Error("220 config requires an interactive terminal");
  }
  return uid;
}

export function runConfiguration(options = {}) {
  const root = options.root;
  if (!path.isAbsolute(root || "")) throw new Error("TM-U220 release root must be absolute");
  const uid = assertInvocation(options);
  const runtime = options.runtime || fs;
  const managed = configurationIsManaged(root, runtime);
  const files = configurationFiles(root, options.environment || process.env, managed);
  const paths = prepareConfiguration(files, { runtime, uid });
  return openInVim(paths, {
    environment: options.environment || process.env,
    spawn: options.spawn,
  });
}
