// Stages immutable releases and atomically activates them while preserving a verified prior release.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertHealthyRelease, inspectInstallation } from "./inspect.mjs";
import { installationLayout, ensureDirectory, existingKind, LAUNCHER_TARGET,
  MANAGER_TARGET, safeReleasePath, assertSafePath } from "./layout.mjs";
import { APPLICATION_VERSION, MANIFEST_NAME, manifestBytes } from "./manifest.mjs";
import { acquireInstallLock } from "./lock.mjs";
import { removeVerifiedRelease } from "./removal.mjs";
import { assertNoRemovalResidues } from "./residue.mjs";
import { prepareSource, writePreparedRelease } from "./source.mjs";
function existingLink(target, expected, runtime) {
  const kind = existingKind(target, runtime);
  if (kind === "missing") return null;
  if (kind !== "symlink") throw new Error(`refusing to replace non-symlink: ${target}`);
  const value = runtime.readlinkSync(target);
  if (expected && value !== expected) throw new Error(`refusing foreign symlink: ${target}`);
  return value;
}
function temporarySibling(target, label) {
  return path.join(path.dirname(target), `.${label}-${randomUUID()}`);
}
function restoreLink(target, prior, runtime) {
  if (prior === null) {
    if (existingKind(target, runtime) === "symlink") runtime.unlinkSync(target);
    return;
  }
  const temporary = temporarySibling(target, "restore");
  runtime.symlinkSync(prior, temporary);
  runtime.renameSync(temporary, target);
}

function activateLinks(layout, releaseId, runtime) {
  const links = [
    { path: layout.current, target: `releases/${releaseId}`, expected: null },
    { path: layout.launcher, target: LAUNCHER_TARGET, expected: LAUNCHER_TARGET },
    { path: layout.managerLauncher, target: MANAGER_TARGET, expected: MANAGER_TARGET },
  ];
  const prior = links.map((link) => existingLink(link.path, link.expected, runtime));
  const temporary = [];
  let activated = 0;
  try {
    for (let index = 0; index < links.length; index += 1) {
      const target = temporarySibling(links[index].path, `activate-${index}`);
      runtime.symlinkSync(links[index].target, target);
      temporary.push(target);
    }
    for (let index = 0; index < links.length; index += 1) {
      runtime.renameSync(temporary[index], links[index].path);
      activated += 1;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (let index = activated - 1; index >= 0; index -= 1) {
      try { restoreLink(links[index].path, prior[index], runtime); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors],
        "activation failed and the prior link state could not be fully restored");
    }
    throw error;
  } finally {
    for (const target of temporary) {
      if (existingKind(target, runtime) === "symlink") runtime.unlinkSync(target);
    }
  }
  return prior[0] !== links[0].target;
}

function prepareDirectories(targets, uid, runtime) {
  const created = [];
  try {
    for (const target of targets) {
      created.push(...ensureDirectory(target, uid, runtime));
    }
    return [...new Set(created)];
  } catch (error) {
    cleanupDirectories(created, runtime);
    throw error;
  }
}

function cleanupDirectories(directories, runtime) {
  for (const target of [...new Set(directories)].reverse()) {
    try {
      if (existingKind(target, runtime) === "directory"
          && runtime.readdirSync(target).length === 0) runtime.rmdirSync(target);
    } catch { /* preserve the primary transaction result */ }
  }
}

function validatePriorState(layout, runtime) {
  const currentKind = existingKind(layout.current, runtime);
  if (currentKind === "missing") {
    const unexpected = runtime.readdirSync(layout.managedRoot)
      .filter((name) => name !== "releases");
    if (unexpected.length) throw new Error(`unexpected managed entries: ${unexpected.join(", ")}`);
    if (runtime.readdirSync(layout.releases).length !== 0) {
      throw new Error("inactive release directories require manual inspection");
    }
    existingLink(layout.launcher, LAUNCHER_TARGET, runtime);
    existingLink(layout.managerLauncher, MANAGER_TARGET, runtime);
    return null;
  }
  const report = inspectInstallation(layout.prefix, runtime);
  if (!report.healthy) throw new Error(`existing installation is unhealthy: ${report.issues.join("; ")}`);
  return report;
}

function versionParts(value) {
  return value.split(".").map(Number);
}

function enforceVersionTransition(prior, next) {
  if (!prior) return;
  const before = versionParts(prior.applicationVersion);
  const after = versionParts(next.applicationVersion);
  const comparison = after.findIndex((part, index) => part !== before[index]);
  if (comparison >= 0 && after[comparison] < before[comparison]) {
    throw new Error("refusing an application version downgrade");
  }
  if (comparison < 0 && prior.contentHash !== next.contentHash) {
    throw new Error("same-version content changed; increment APPLICATION_VERSION before installing");
  }
}

export function installRelease(options) {
  const runtime = options.runtime || fs;
  const uid = options.uid ?? process.getuid?.();
  if ((options.platform || process.platform) !== "darwin") {
    throw new Error("installation is supported only on macOS");
  }
  if (uid === 0) throw new Error("run the installer as a normal user, not root or sudo");
  const layout = installationLayout(options.prefix);
  for (const target of [layout.prefix, layout.bin, layout.library]) {
    if (existingKind(target, runtime) !== "missing") {
      assertSafePath(target, { finalKind: "directory", uid }, runtime);
    }
  }
  assertNoRemovalResidues(layout, runtime);
  const prepared = prepareSource(options.sourceRoot, options.payload,
    options.version || APPLICATION_VERSION, runtime);
  for (const target of [layout.prefix, layout.bin, layout.library]) ensureDirectory(target, uid, runtime);
  const releaseLock = acquireInstallLock(layout, { runtime, uid });
  let createdDirectories;
  try {
    createdDirectories = prepareDirectories([layout.managedRoot, layout.releases], uid, runtime);
  } catch (error) { releaseLock.release(); throw error; }
  let stage = null;
  let createdRelease = null;
  let success = false;
  try {
    assertNoRemovalResidues(layout, runtime);
    const prior = validatePriorState(layout, runtime);
    enforceVersionTransition(prior?.release?.manifest || null, prepared.manifest);
    const releaseRoot = safeReleasePath(layout.releases, prepared.manifest.releaseId);
    let created = false;
    if (existingKind(releaseRoot, runtime) === "missing") {
      stage = path.join(layout.releases, `.stage-${randomUUID()}`);
      runtime.mkdirSync(stage, { mode: 0o700 });
      writePreparedRelease(stage, prepared, runtime);
      runtime.writeFileSync(path.join(stage, MANIFEST_NAME), manifestBytes(prepared.manifest),
        { flag: "wx", mode: 0o600 });
      runtime.chmodSync(path.join(stage, MANIFEST_NAME), 0o644);
      runtime.chmodSync(stage, 0o755);
      assertHealthyRelease(stage, runtime, false);
      runtime.renameSync(stage, releaseRoot);
      stage = null;
      created = true;
      createdRelease = releaseRoot;
    } else {
      const report = assertHealthyRelease(releaseRoot, runtime);
      if (report.manifest.contentHash !== prepared.manifest.contentHash) {
        throw new Error("existing release identifier has different content");
      }
    }
    const changed = activateLinks(layout, prepared.manifest.releaseId, runtime);
    success = true;
    return { installed: true, changed, created, prefix: layout.prefix,
      launcher: layout.launcher, managerLauncher: layout.managerLauncher,
      releaseRoot, manifest: prepared.manifest };
  } finally {
    try {
      if (stage && existingKind(stage, runtime) === "directory") {
        runtime.rmSync(stage, { recursive: true, force: false });
      }
      if (!success && createdRelease && existingKind(createdRelease, runtime) === "directory") {
        const active = existingKind(layout.current, runtime) === "symlink"
          && runtime.readlinkSync(layout.current) === `releases/${prepared.manifest.releaseId}`;
        if (!active) removeVerifiedRelease(createdRelease, runtime);
      }
    } finally {
      if (!success) cleanupDirectories(createdDirectories, runtime);
      releaseLock.release();
    }
  }
}
