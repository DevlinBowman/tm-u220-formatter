// Reads the macOS package receipt as installation evidence without requesting privileges.
// Receipt presence is reported separately from file and effective-policy verification.
import { spawnSync as nodeSpawnSync } from "node:child_process";

export function auditPackageReceipt(identifier, runtime = {}) {
  if (!identifier) {
    return { identifier: null, reportedIdentifier: null,
      queried: false, found: false, version: null,
      error: "package identifier is unavailable" };
  }
  const spawnSync = runtime.spawnSync || nodeSpawnSync;
  const result = spawnSync("/usr/sbin/pkgutil", ["--pkg-info", identifier], {
    encoding: "utf8", timeout: runtime.receiptTimeoutMs || 3000,
    maxBuffer: 64 * 1024,
    env: { LC_ALL: "C", LANG: "C", PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
  });
  if (result?.error || result?.status !== 0) {
    return { identifier, reportedIdentifier: null, queried: true, found: false, version: null,
      error: String(result?.error?.message || result?.stderr || "package receipt is absent")
        .replace(/[\r\n]+/g, " ").trim().slice(0, 240) };
  }
  const output = String(result.stdout || "");
  const reportedIdentifier = output.match(/^package-id:\s*(.+)$/m)?.[1]?.trim() || null;
  const version = output.match(/^version:\s*(.+)$/m)?.[1]?.trim() || null;
  const found = reportedIdentifier === identifier && Boolean(version);
  return { identifier, reportedIdentifier, queried: true, found, version,
    error: found ? null : "package receipt identity or version is invalid" };
}
