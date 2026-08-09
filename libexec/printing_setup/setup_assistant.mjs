// Launches the native macOS selection assistant and validates its bounded structured result.
// It gathers policy choices only; device contact waits for the installed privileged-source bypass.
import { spawnSync as nodeSpawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SCRIPT = fileURLToPath(new URL("./setup_assistant.js", import.meta.url));
const MAXIMUM_RESULT_BYTES = 8192;

export function describeProfile(profile) {
  const options = profile?.options;
  if (!options) throw new Error("the included printer profile has no hardware description");
  return `TM-U220${options.variant}, ${options.paper} mm paper, DIP switch 2-1 `
    + `${options.dip2_1}, ${options.cutter} cutter`;
}

function parseResult(stdout) {
  if (typeof stdout !== "string" || Buffer.byteLength(stdout) > MAXIMUM_RESULT_BYTES) {
    throw new Error("the setup assistant returned an oversized result");
  }
  let value;
  try { value = JSON.parse(stdout.trim()); } catch {
    throw new Error("the setup assistant returned malformed data");
  }
  if (value?.schemaVersion !== 1 || !new Set(["continue", "cancel"]).has(value.action)) {
    throw new Error("the setup assistant returned an unsupported result");
  }
  if (value.action === "cancel") return Object.freeze({ cancelled: true });
  if (typeof value.host !== "string" || value.host.length > 64
      || typeof value.profilePath !== "string" || value.profilePath.length > 4096) {
    throw new Error("the setup assistant returned invalid selections");
  }
  return Object.freeze({ cancelled: false, host: value.host,
    profilePath: value.profilePath });
}

export function runSetupAssistant(input, runtime = {}) {
  const scriptPath = runtime.scriptPath || DEFAULT_SCRIPT;
  const config = {
    schemaVersion: 1,
    host: input.host || null,
    suggestedHost: input.suggestedHost || null,
    profilePath: input.profilePath || null,
    defaultProfilePath: input.defaultProfilePath,
    defaultProfileDirectory: path.dirname(input.defaultProfilePath),
    defaultProfileDescription: input.defaultProfileDescription,
  };
  const spawnSync = runtime.spawnSync || nodeSpawnSync;
  const result = spawnSync("/usr/bin/osascript", [
    "-l", "JavaScript", scriptPath, JSON.stringify(config),
  ], { encoding: "utf8", maxBuffer: MAXIMUM_RESULT_BYTES, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(`the setup assistant could not open${detail ? `: ${detail}` : ""}`);
  }
  return parseResult(result.stdout);
}

export { parseResult as parseSetupAssistantResult };
