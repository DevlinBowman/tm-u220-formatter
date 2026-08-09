#!/usr/bin/env node
// Orchestrates source manifests, unprivileged installation, integrity inspection, and explicit removal.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArguments, usage, UsageError } from "./arguments.mjs";
import { checkDependencies } from "./dependencies.mjs";
import { inspectInstallation } from "./inspect.mjs";
import { APPLICATION_VERSION } from "./manifest.mjs";
import { LUA_PAYLOAD } from "./payload/lua.mjs";
import { NODE_PAYLOAD } from "./payload/node.mjs";
import { RESOURCE_PAYLOAD } from "./payload/resources.mjs";
import { prepareSource } from "./source.mjs";
import { installRelease } from "./transaction.mjs";
import { uninstall } from "./uninstall.mjs";

export const DISTRIBUTION_PAYLOAD = Object.freeze([
  ...LUA_PAYLOAD, ...NODE_PAYLOAD, ...RESOURCE_PAYLOAD,
]);

function sourceRoot() {
  return fileURLToPath(new URL("../", import.meta.url));
}

export function installedPrefix(root) {
  const normalized = path.normalize(root);
  const marker = `${path.sep}lib${path.sep}tm-u220${path.sep}releases${path.sep}`;
  const index = normalized.lastIndexOf(marker);
  if (index < 1) return null;
  const releaseId = normalized.slice(index + marker.length).replace(/[\\/]$/, "");
  if (!/^\d+\.\d+\.\d+-[0-9a-f]{16}$/.test(releaseId)) return null;
  return normalized.slice(0, index);
}

function emit(io, value, json) {
  if (json) io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else io.stdout.write(`${value}\n`);
}

function manifestSummary(manifest) {
  return [
    `TM-U220 ${manifest.applicationVersion}`,
    `Release: ${manifest.releaseId}`,
    `Payload files: ${manifest.payload.length}`,
    `Payload SHA-256: ${manifest.contentHash}`,
    "Source trust: local checkout; no publisher signature was verified.",
    "Snapshot: every allowlisted file matched across two complete read passes.",
  ].join("\n");
}

function installSummary(result) {
  const action = result.changed ? "Activated" : "Already active";
  return [
    `${action}: TM-U220 ${result.manifest.applicationVersion}`,
    `Release: ${result.releaseRoot}`,
    `Command: ${result.launcher}`,
    `Install manager: ${result.managerLauncher}`,
    "Privilege: normal user only; sudo was not used.",
    "Printer authorization: unchanged. Run 220 setup-printing separately when required.",
    "Source provenance: locally hashed checkout; no publisher signature was verified.",
  ].join("\n");
}

function inspectionSummary(report) {
  if (!report.installed) {
    return report.issues.length ? `Not installed\nIssues:\n- ${report.issues.join("\n- ")}` : "Not installed";
  }
  const lines = [report.healthy ? "Installation: healthy" : "Installation: unhealthy",
    `Prefix: ${report.prefix}`];
  if (report.busy) lines.push(`Install transaction: active (PID ${report.lock.metadata.pid})`);
  if (report.release?.manifest) {
    lines.push(`Version: ${report.release.manifest.applicationVersion}`,
      `Release: ${report.release.manifest.releaseId}`,
      `Payload files: ${report.release.manifest.payload.length}`,
      `Payload SHA-256: ${report.release.manifest.contentHash}`);
  }
  if (report.issues.length) lines.push(`Issues:\n- ${report.issues.join("\n- ")}`);
  return lines.join("\n");
}

function uninstallSummary(result, removing) {
  if (!result.installed) {
    return result.issues.length
      ? `No active TM-U220 installation, but cleanup is required:\n- ${result.issues.join("\n- ")}`
      : "TM-U220 is not installed at this prefix.";
  }
  if (!result.removable) return `Removal refused:\n- ${result.issues.join("\n- ")}`;
  const warning = ["IMPORTANT: the root-owned printer policy and NOPASSWD rules are not removed.",
    "Before removing the app, run: 220 printing-status",
    "Supported deauthorization: 220 remove-printing --remove",
    "Then verify deauthorization with: 220 printing-status"];
  if (result.removed) return [
    `Removed the verified unprivileged TM-U220 application from ${result.prefix}.`,
    ...warning,
    "The app's printing-status inspector has also been removed.",
    "To deauthorize later, reinstall or use a source checkout, then run the supported commands above.",
  ].join("\n");
  return ["Dry run only; nothing was removed.", ...warning,
    "Verified paths that --remove would delete:",
    ...result.paths.map((target) => `- ${target}`),
    removing ? "" : "Removal requires --remove --keep-printing-policy when policy is intentionally retained."]
    .filter(Boolean).join("\n");
}

export async function runCli(argv, io = process, runtime = {}) {
  const root = runtime.sourceRoot || sourceRoot();
  const parsed = parseArguments(argv, { ...runtime,
    defaultPrefix: runtime.defaultPrefix || installedPrefix(root) });
  if (parsed.help) { emit(io, usage(), false); return 0; }
  if (parsed.command === "version") { emit(io, APPLICATION_VERSION, parsed.json); return 0; }
  if (parsed.command === "manifest") {
    const prepared = prepareSource(root, DISTRIBUTION_PAYLOAD, APPLICATION_VERSION);
    emit(io, parsed.json ? prepared.manifest : manifestSummary(prepared.manifest), parsed.json);
    return 0;
  }
  if (parsed.command === "inspect") {
    const report = inspectInstallation(parsed.prefix);
    emit(io, parsed.json ? report : inspectionSummary(report), parsed.json);
    return report.healthy ? 0 : 1;
  }
  if (parsed.command === "uninstall") {
    const result = uninstall({ prefix: parsed.prefix, remove: parsed.remove,
      keepPrintingPolicy: parsed.keepPrintingPolicy });
    emit(io, parsed.json ? result : uninstallSummary(result, parsed.remove), parsed.json);
    return result.removable ? 0 : 1;
  }
  checkDependencies(runtime.dependencies || {});
  const result = installRelease({ prefix: parsed.prefix, sourceRoot: root,
    payload: DISTRIBUTION_PAYLOAD, version: APPLICATION_VERSION });
  emit(io, parsed.json ? result : installSummary(result), parsed.json);
  return 0;
}

export async function main(argv = [], io = process, runtime = {}) {
  try { return await runCli(argv, io, runtime); }
  catch (error) {
    const usageFailure = error instanceof UsageError;
    const guidance = usageFailure ? "; run 'tm-u220-install help' for usage" : "";
    io.stderr.write(`tm-u220-install: ${error.message}${guidance}\n`);
    return usageFailure ? 2 : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
