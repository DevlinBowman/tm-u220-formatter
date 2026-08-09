#!/usr/bin/env node
// Runs the private configuration workflow from the active release as the ordinary user.
// Public argument validation remains in the Lua CLI; this entry owns only environment facts.
import { fileURLToPath } from "node:url";
import { runConfiguration } from "./configuration/cli.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

try {
  if (process.argv.length !== 2) throw new Error("configuration helper accepts no arguments");
  process.exitCode = runConfiguration({
    root,
    environment: process.env,
    platform: process.platform,
    uid: process.getuid?.(),
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
  });
} catch (error) {
  process.stderr.write(`220 config: ${error.message}\n`);
  process.exitCode = 1;
}
