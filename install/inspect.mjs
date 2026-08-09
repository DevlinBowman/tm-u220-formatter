// Inspects a managed release and its activation links without authorization, network I/O, or mutation.
import fs from "node:fs";
import path from "node:path";
import { installationLayout, assertSafePath, existingKind, LAUNCHER_TARGET, MANAGER_TARGET,
  safeReleasePath } from "./layout.mjs";
import { MANIFEST_NAME, manifestBytes, parseManifest, sha256 } from "./manifest.mjs";
import { inspectInstallLock, inspectLockResidues } from "./lock.mjs";
import { inspectRemovalResidues } from "./residue.mjs";
import { safeReadFile } from "./source.mjs";

function relativeName(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function expectedDirectories(payload) {
  const found = new Set();
  for (const entry of payload) {
    let current = path.posix.dirname(entry.path);
    while (current !== ".") {
      found.add(current);
      current = path.posix.dirname(current);
    }
  }
  return found;
}

function walk(root, runtime, issues) {
  const files = new Map();
  const directories = new Map();
  const visit = (directory) => {
    for (const name of runtime.readdirSync(directory).sort()) {
      const target = path.join(directory, name);
      const relative = relativeName(root, target);
      const stat = runtime.lstatSync(target);
      if (stat.isSymbolicLink()) issues.push(`release contains symlink: ${relative}`);
      else if (stat.isDirectory()) {
        directories.set(relative, stat);
        visit(target);
      } else if (stat.isFile()) files.set(relative, stat);
      else issues.push(`release contains special file: ${relative}`);
    }
  };
  visit(root);
  return { files, directories };
}

export function inspectRelease(releaseRoot, runtime = fs, uid = process.getuid?.(),
    requireDirectoryIdentity = true) {
  const issues = [];
  if (existingKind(releaseRoot, runtime) !== "directory") {
    return { healthy: false, releaseRoot, manifest: null,
      issues: [`release is not a directory: ${releaseRoot}`] };
  }
  const rootStat = runtime.lstatSync(releaseRoot);
  if (uid !== undefined && rootStat.uid !== uid) issues.push("release root has the wrong owner");
  if ((rootStat.mode & 0o777) !== 0o755) issues.push("release root has the wrong mode");
  let manifest;
  let rawManifest;
  try {
    rawManifest = safeReadFile(path.join(releaseRoot, MANIFEST_NAME), 1024 * 1024, runtime);
    manifest = parseManifest(rawManifest);
  } catch (error) {
    return { healthy: false, releaseRoot, manifest: null,
      issues: [`invalid installed manifest: ${error.message}`] };
  }
  if (!rawManifest.equals(manifestBytes(manifest))) issues.push("installed manifest bytes are not canonical");
  if (requireDirectoryIdentity && path.basename(releaseRoot) !== manifest.releaseId) {
    issues.push("release directory identity mismatch");
  }
  const actual = walk(releaseRoot, runtime, issues);
  const expectedFiles = new Set([MANIFEST_NAME, ...manifest.payload.map((entry) => entry.path)]);
  for (const name of actual.files.keys()) {
    if (!expectedFiles.has(name)) issues.push(`unexpected installed file: ${name}`);
  }
  for (const name of expectedFiles) {
    if (!actual.files.has(name)) issues.push(`missing installed file: ${name}`);
  }
  const expectedDirs = expectedDirectories(manifest.payload);
  for (const [name, stat] of actual.directories) {
    if (!expectedDirs.has(name)) issues.push(`unexpected installed directory: ${name}`);
    if (uid !== undefined && stat.uid !== uid) issues.push(`wrong directory owner: ${name}`);
    if ((stat.mode & 0o777) !== 0o755) issues.push(`wrong directory mode: ${name}`);
  }
  for (const name of expectedDirs) {
    if (!actual.directories.has(name)) issues.push(`missing installed directory: ${name}`);
  }
  for (const entry of manifest.payload) {
    const stat = actual.files.get(entry.path);
    if (!stat) continue;
    if (uid !== undefined && stat.uid !== uid) issues.push(`wrong owner: ${entry.path}`);
    if (stat.nlink !== 1) issues.push(`multiple hard links: ${entry.path}`);
    if ((stat.mode & 0o777) !== entry.mode) issues.push(`wrong mode: ${entry.path}`);
    if (stat.size !== entry.bytes) issues.push(`wrong byte count: ${entry.path}`);
    try {
      const bytes = safeReadFile(path.join(releaseRoot, ...entry.path.split("/")), undefined, runtime);
      if (sha256(bytes) !== entry.sha256) issues.push(`SHA-256 mismatch: ${entry.path}`);
    } catch (error) { issues.push(`${entry.path}: ${error.message}`); }
  }
  const manifestStat = actual.files.get(MANIFEST_NAME);
  if (manifestStat && (manifestStat.mode & 0o777) !== 0o644) issues.push("wrong manifest mode");
  if (manifestStat && manifestStat.nlink !== 1) issues.push("install manifest has multiple hard links");
  if (manifestStat && uid !== undefined && manifestStat.uid !== uid) issues.push("wrong manifest owner");
  return { healthy: issues.length === 0, releaseRoot, manifest, issues };
}

function checkLink(target, expected, label, runtime, issues) {
  if (existingKind(target, runtime) !== "symlink") {
    issues.push(`${label} is missing or is not a symlink`);
    return null;
  }
  const value = runtime.readlinkSync(target);
  if (expected && value !== expected) issues.push(`${label} points outside the managed layout`);
  return value;
}

export function inspectInstallation(prefix, runtime = fs) {
  const layout = installationLayout(prefix);
  const issues = [];
  const uid = process.getuid?.();
  const lock = inspectInstallLock(layout, { runtime, uid });
  const lockResidues = inspectLockResidues(layout, runtime);
  const removalResidues = inspectRemovalResidues(layout, runtime);
  if (!lock.valid) issues.push(...lock.issues);
  else if (lock.stale) issues.push(`stale install lock from PID ${lock.metadata.pid}`);
  if (lockResidues.present) issues.push(`install lock recovery residues: ${lockResidues.paths.join(", ")}`);
  if (removalResidues.present) {
    issues.push(`incomplete uninstall residues: ${removalResidues.paths.join(", ")}. `
      + removalResidues.remediation);
  }
  for (const target of [layout.prefix, layout.bin, layout.library, layout.managedRoot]) {
    if (existingKind(target, runtime) === "missing") continue;
    try { assertSafePath(target, { finalKind: "directory", uid }, runtime); }
    catch (error) { issues.push(error.message); }
  }
  const rootKind = existingKind(layout.managedRoot, runtime);
  if (rootKind === "missing") {
    if (existingKind(layout.launcher, runtime) !== "missing") issues.push("orphaned 220 launcher exists");
    if (existingKind(layout.managerLauncher, runtime) !== "missing") {
      issues.push("orphaned tm-u220-install launcher exists");
    }
    return { installed: false, healthy: false, prefix: layout.prefix, release: null,
      releases: [], lock, lockResidues, busy: lock.active, removalResidues, issues };
  }
  if (rootKind !== "directory") {
    issues.push("managed installation root is not a directory");
    return { installed: true, healthy: false, prefix: layout.prefix, release: null,
      releases: [], lock, lockResidues, busy: lock.active, removalResidues, issues };
  }
  const rootEntries = runtime.readdirSync(layout.managedRoot).sort();
  for (const name of rootEntries) {
    if (!["current", "releases"].includes(name)) issues.push(`unexpected managed entry: ${name}`);
  }
  if (existingKind(layout.releases, runtime) !== "directory") {
    issues.push("releases entry is missing or is not a directory");
  } else {
    try { assertSafePath(layout.releases, { finalKind: "directory", uid }, runtime); }
    catch (error) { issues.push(error.message); }
  }
  const currentTarget = checkLink(layout.current, null, "current release", runtime, issues);
  checkLink(layout.launcher, LAUNCHER_TARGET, "220 launcher", runtime, issues);
  checkLink(layout.managerLauncher, MANAGER_TARGET, "tm-u220-install launcher", runtime, issues);
  let release = null;
  const releases = [];
  if (existingKind(layout.releases, runtime) === "directory") {
    for (const name of runtime.readdirSync(layout.releases).sort()) {
      try {
        const report = inspectRelease(safeReleasePath(layout.releases, name), runtime);
        releases.push(report);
        issues.push(...report.issues.map((issue) => `${name}: ${issue}`));
      } catch (error) { issues.push(`${name}: ${error.message}`); }
    }
  }
  const match = currentTarget?.match(/^releases\/(\d+\.\d+\.\d+-[0-9a-f]{16})$/);
  if (!match) issues.push("current release target is not canonical");
  else {
    const releaseRoot = safeReleasePath(layout.releases, match[1]);
    release = releases.find((candidate) => candidate.releaseRoot === releaseRoot) || null;
    if (!release) issues.push("current release is absent from the managed release set");
  }
  return { installed: true, healthy: issues.length === 0, prefix: layout.prefix,
    release, releases, lock, lockResidues, busy: lock.active, removalResidues, issues };
}

export function assertHealthyRelease(releaseRoot, runtime = fs, requireDirectoryIdentity = true) {
  const report = inspectRelease(releaseRoot, runtime, process.getuid?.(), requireDirectoryIdentity);
  if (!report.healthy) throw new Error(`release integrity failed: ${report.issues.join("; ")}`);
  return report;
}
