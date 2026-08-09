// Removes only a verified user installation after explicit acknowledgment of retained machine policy.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inspectInstallation, inspectRelease } from "./inspect.mjs";
import { installationLayout, assertSafePath, existingKind, safeReleasePath } from "./layout.mjs";
import { acquireInstallLock } from "./lock.mjs";
import { removeVerifiedRelease } from "./removal.mjs";
import { inspectRemovalResidues } from "./residue.mjs";

export const PRINTING_POLICY_GUIDANCE = Object.freeze({
  retained: true,
  inspectBeforeAppRemoval: "220 printing-status",
  deauthorize: "220 remove-printing --remove",
  verifyAfterDeauthorization: "220 printing-status",
  manualFallback: "Use a source checkout or reinstall the app, then follow "
    + "docs/printing-policy.md#legacy-migration-and-removal.",
  postRemoval: "To deauthorize later, reinstall or use a source checkout, then run "
    + "220 remove-printing --remove and 220 printing-status.",
  warning: "Removing the user application does not remove root-owned printer policy or NOPASSWD rules.",
});

function inspectAllReleases(layout, runtime) {
  const issues = [];
  const releases = [];
  if (existingKind(layout.releases, runtime) !== "directory") {
    return { releases, issues: ["releases entry is not a directory"] };
  }
  for (const name of runtime.readdirSync(layout.releases).sort()) {
    let releaseRoot;
    try { releaseRoot = safeReleasePath(layout.releases, name); }
    catch (error) { issues.push(`${name}: ${error.message}`); continue; }
    const report = inspectRelease(releaseRoot, runtime);
    releases.push(report);
    issues.push(...report.issues.map((issue) => `${name}: ${issue}`));
  }
  return { releases, issues };
}

export function planUninstall(prefix, runtime = fs, options = {}) {
  const layout = installationLayout(prefix);
  const active = inspectInstallation(prefix, runtime);
  const policy = PRINTING_POLICY_GUIDANCE;
  if (!active.installed) {
    return { installed: false, removable: active.issues.length === 0, prefix: layout.prefix,
      paths: [], issues: active.issues, releases: [], printingPolicyRetained: true,
      printingPolicyGuidance: policy };
  }
  const all = inspectAllReleases(layout, runtime);
  const issues = [...active.issues, ...all.issues];
  if (active.busy && active.lock.metadata.nonce !== options.lockNonce) {
    issues.push(`install transaction is active (PID ${active.lock.metadata.pid})`);
  }
  const paths = [layout.launcher, layout.managerLauncher, layout.current,
    ...all.releases.map((release) => release.releaseRoot), layout.releases, layout.managedRoot];
  return { installed: true, removable: issues.length === 0, prefix: layout.prefix,
    paths, issues, releases: all.releases, printingPolicyRetained: true,
    printingPolicyGuidance: policy };
}

function rollbackDeactivation(state, runtime) {
  const errors = [];
  for (const [backup, target] of [[state.managerBackup, state.layout.managerLauncher],
    [state.launcherBackup, state.layout.launcher]]) {
    try { if (existingKind(backup, runtime) === "symlink") runtime.renameSync(backup, target); }
    catch (error) { errors.push(error); }
  }
  try {
    if (existingKind(state.quarantine, runtime) === "directory"
        && existingKind(state.layout.managedRoot, runtime) === "missing") {
      runtime.renameSync(state.quarantine, state.layout.managedRoot);
    }
  } catch (error) { errors.push(error); }
  return errors;
}

function deactivate(layout, runtime) {
  const nonce = randomUUID();
  const state = { layout, quarantine: path.join(layout.library, `.tm-u220-removing-${nonce}`),
    launcherBackup: path.join(layout.bin, `.220-removing-${nonce}`),
    managerBackup: path.join(layout.bin, `.tm-u220-install-removing-${nonce}`) };
  for (const target of [state.quarantine, state.launcherBackup, state.managerBackup]) {
    if (existingKind(target, runtime) !== "missing") throw new Error(`removal staging path exists: ${target}`);
  }
  try {
    runtime.renameSync(layout.managedRoot, state.quarantine);
    runtime.renameSync(layout.launcher, state.launcherBackup);
    runtime.renameSync(layout.managerLauncher, state.managerBackup);
    return state;
  } catch (error) {
    const rollback = rollbackDeactivation(state, runtime);
    if (rollback.length) throw new AggregateError([error, ...rollback], "uninstall deactivation rollback failed");
    throw error;
  }
}

function deleteQuarantine(state, releases, runtime) {
  for (const release of releases) {
    const target = path.join(state.quarantine, "releases", path.basename(release.releaseRoot));
    removeVerifiedRelease(target, runtime);
  }
  runtime.rmdirSync(path.join(state.quarantine, "releases"));
  runtime.unlinkSync(path.join(state.quarantine, "current"));
  runtime.rmdirSync(state.quarantine);
  runtime.unlinkSync(state.launcherBackup);
  runtime.unlinkSync(state.managerBackup);
}

function quarantineIsIntact(state, releases, runtime) {
  if (existingKind(state.quarantine, runtime) !== "directory"
      || existingKind(state.launcherBackup, runtime) !== "symlink"
      || existingKind(state.managerBackup, runtime) !== "symlink"
      || existingKind(path.join(state.quarantine, "current"), runtime) !== "symlink") return false;
  return releases.every((release) => {
    const target = path.join(state.quarantine, "releases", path.basename(release.releaseRoot));
    return inspectRelease(target, runtime).healthy;
  });
}

export function uninstall(options) {
  const runtime = options.runtime || fs;
  const uid = options.uid ?? process.getuid?.();
  if ((options.platform || process.platform) !== "darwin") {
    throw new Error("uninstall is supported only on macOS");
  }
  if (uid === 0) throw new Error("run uninstall as a normal user, not root or sudo");
  const initial = planUninstall(options.prefix, runtime);
  if (!options.remove || !initial.installed) return { ...initial, removed: false };
  if (!options.keepPrintingPolicy) {
    throw new Error("refusing removal without --keep-printing-policy: first run `220 printing-status`; "
      + "use `220 remove-printing --remove` and verify with `220 printing-status`, or explicitly "
      + "acknowledge that root-owned policy and NOPASSWD rules will remain");
  }
  const layout = installationLayout(options.prefix);
  for (const target of [layout.prefix, layout.bin, layout.library, layout.managedRoot]) {
    assertSafePath(target, { finalKind: "directory", uid }, runtime);
  }
  const lock = acquireInstallLock(layout, { runtime, uid });
  try {
    const confirmed = planUninstall(options.prefix, runtime, { lockNonce: lock.metadata.nonce });
    if (!confirmed.removable) {
      throw new Error(`refusing unsafe uninstall: ${confirmed.issues.join("; ")}`);
    }
    const state = deactivate(layout, runtime);
    try { deleteQuarantine(state, confirmed.releases, runtime); }
    catch (error) {
      if (quarantineIsIntact(state, confirmed.releases, runtime)) {
        const rollback = rollbackDeactivation(state, runtime);
        if (!rollback.length) throw new Error(`uninstall failed; the prior installation was restored: ${error.message}`);
        throw new AggregateError([error, ...rollback], "uninstall failed and quarantine rollback was incomplete");
      }
      const residue = inspectRemovalResidues(layout, runtime);
      throw new Error(`uninstall stopped after payload deletion began: ${error.message}. `
        + `${residue.remediation} Reserved paths: ${residue.paths.join(", ")}`);
    }
    return { ...confirmed, removed: true, printingPolicyRetained: true,
      printingPolicyGuidance: PRINTING_POLICY_GUIDANCE };
  } finally { lock.release(); }
}
