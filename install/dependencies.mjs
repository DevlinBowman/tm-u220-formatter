// Verifies the unprivileged runtime and every fixed macOS executable used by shipped features.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const FIXED_TOOLS = Object.freeze([
  "/bin/bash", "/bin/rm", "/bin/rmdir", "/usr/bin/codesign", "/usr/bin/cpio",
  "/usr/bin/dirname", "/usr/bin/env", "/usr/bin/lsbom",
  "/usr/bin/mkbom", "/usr/bin/nc",
  "/usr/bin/open", "/usr/bin/osacompile", "/usr/bin/osascript", "/usr/bin/perl", "/usr/bin/plutil",
  "/usr/bin/qlmanage", "/usr/bin/readlink", "/usr/bin/shasum", "/usr/bin/sudo", "/usr/bin/vim",
  "/usr/sbin/pkgutil", "/usr/sbin/visudo",
]);

function executable(target, runtime) {
  try {
    const stat = runtime.stat(target);
    runtime.access(target, fs.constants.X_OK);
    return stat.isFile();
  } catch { return false; }
}

export function findOnPath(name, pathValue, runtime) {
  for (const directory of String(pathValue || "").split(path.delimiter)) {
    if (!directory || !path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    if (executable(candidate, runtime)) return candidate;
  }
  return null;
}

function versionAtLeast(value, minimum) {
  const found = value.replace(/^v/, "").split(".").map(Number);
  const wanted = minimum.split(".").map(Number);
  if (found.some((part) => !Number.isInteger(part))) return false;
  for (let index = 0; index < wanted.length; index += 1) {
    if ((found[index] || 0) !== wanted[index]) return (found[index] || 0) > wanted[index];
  }
  return true;
}

function supportedLuaVersion(value) {
  const match = String(value || "").trim().match(/^Lua (\d+)\.(\d+)$/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 5 || (major === 5 && minor >= 3);
}

export function checkDependencies(options = {}) {
  const runtime = {
    platform: options.platform || process.platform,
    uid: options.uid ?? process.getuid?.(),
    nodeVersion: options.nodeVersion || process.version,
    path: options.path ?? process.env.PATH,
    stat: options.stat || fs.statSync,
    access: options.access || fs.accessSync,
    spawn: options.spawn || spawnSync,
  };
  const issues = [];
  if (runtime.platform !== "darwin") issues.push("installation is supported only on macOS");
  if (runtime.uid === 0) issues.push("run the installer as a normal user, not root or sudo");
  if (!versionAtLeast(runtime.nodeVersion, "20.11.0")) issues.push("Node.js 20.11 or newer is required");
  const node = findOnPath("node", runtime.path, runtime);
  const lua = findOnPath("lua", runtime.path, runtime);
  if (!node) issues.push("node is not executable on PATH");
  if (!lua) issues.push("Lua 5.3 or newer is not executable on PATH");
  if (lua) {
    const probe = runtime.spawn(lua, ["-e", "io.write(_VERSION)"],
      { encoding: "utf8", timeout: 3000, shell: false });
    if (probe.status !== 0 || !supportedLuaVersion(probe.stdout)) {
      issues.push("Lua 5.3 or newer is required");
    }
  }
  if (node) {
    const probe = runtime.spawn(node, ["--version"],
      { encoding: "utf8", timeout: 3000, shell: false });
    if (probe.status !== 0 || !versionAtLeast(String(probe.stdout || "").trim(), "20.11.0")) {
      issues.push("the node executable on PATH must be version 20.11 or newer");
    }
  }
  const missingTools = FIXED_TOOLS.filter((target) => !executable(target, runtime));
  if (missingTools.length) issues.push(`required macOS tools are missing: ${missingTools.join(", ")}`);
  if (issues.length) throw new Error(issues.join("; "));
  return Object.freeze({ platform: runtime.platform, node, nodeVersion: runtime.nodeVersion,
    lua, fixedTools: FIXED_TOOLS });
}
