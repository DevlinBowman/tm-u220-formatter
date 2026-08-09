// Defines the user-prefix installation layout and rejects ambiguous or symlinked managed paths.
import fs from "node:fs";
import path from "node:path";

export const LAUNCHER_TARGET = "../lib/tm-u220/current/bin/tm-u220";
export const MANAGER_TARGET = "../lib/tm-u220/current/install/tm-u220";

export function installationLayout(prefix) {
  const normalized = path.normalize(prefix);
  if (!path.isAbsolute(normalized) || normalized === path.parse(normalized).root) {
    throw new Error("installation prefix must be an absolute non-root directory");
  }
  const library = path.join(normalized, "lib");
  const managedRoot = path.join(library, "tm-u220");
  return Object.freeze({ prefix: normalized, bin: path.join(normalized, "bin"), library,
    managedRoot, releases: path.join(managedRoot, "releases"),
    current: path.join(managedRoot, "current"), launcher: path.join(normalized, "bin", "220"),
    managerLauncher: path.join(normalized, "bin", "tm-u220-install"),
    lock: path.join(library, ".tm-u220-install.lock"),
    lockRecovery: path.join(library, ".tm-u220-install.lock.recovery") });
}

export function existingKind(target, runtime = fs) {
  try {
    const stat = runtime.lstatSync(target);
    if (stat.isSymbolicLink()) return "symlink";
    if (stat.isDirectory()) return "directory";
    if (stat.isFile()) return "file";
    return "special";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

function components(target) {
  const parsed = path.parse(target);
  const relative = target.slice(parsed.root.length).split(path.sep).filter(Boolean);
  const found = [parsed.root];
  for (const part of relative) found.push(path.join(found.at(-1), part));
  return found;
}

export function assertSafePath(target, options = {}, runtime = fs) {
  const { finalKind, uid = process.getuid?.() } = options;
  let stickyBoundary = null;
  let protectedAfterSticky = false;
  for (const component of components(path.normalize(target))) {
    const kind = existingKind(component, runtime);
    if (kind === "missing") break;
    if (kind === "symlink") throw new Error(`refusing symlinked path component: ${component}`);
    if (component !== target && kind !== "directory") {
      throw new Error(`path component is not a directory: ${component}`);
    }
    if (kind === "directory") {
      const stat = runtime.lstatSync(component);
      if ((stat.mode & 0o022) !== 0) {
        const systemSticky = stat.uid === 0 && (stat.mode & 0o1000) !== 0
          && (stat.mode & 0o002) !== 0;
        if (!systemSticky) throw new Error(`unsafe writable path ancestor: ${component}`);
        stickyBoundary = component;
        protectedAfterSticky = false;
      } else if (stickyBoundary && component !== stickyBoundary
          && (stat.uid === uid || stat.uid === 0)) protectedAfterSticky = true;
    }
  }
  if (stickyBoundary && !protectedAfterSticky) {
    throw new Error(`shared sticky ancestor lacks a private owned barrier: ${stickyBoundary}`);
  }
  const kind = existingKind(target, runtime);
  if (finalKind && kind !== "missing" && kind !== finalKind) {
    throw new Error(`${target} must be a ${finalKind}`);
  }
  if (kind === "directory" && uid !== undefined) {
    const stat = runtime.lstatSync(target);
    if (stat.uid !== uid) throw new Error(`directory is not owned by the current user: ${target}`);
    if ((stat.mode & 0o022) !== 0) throw new Error(`directory is group/world writable: ${target}`);
  }
  return kind;
}

export function ensureDirectory(target, uid = process.getuid?.(), runtime = fs) {
  const chain = components(path.normalize(target));
  const created = [];
  assertSafePath(target, { uid }, runtime);
  const firstMissing = chain.findIndex((component) => existingKind(component, runtime) === "missing");
  if (firstMissing > 0) {
    const anchor = chain[firstMissing - 1];
    const stat = runtime.lstatSync(anchor);
    if (stat.uid !== uid || (stat.mode & 0o022) !== 0) {
      throw new Error(`new directories require a private user-owned parent: ${anchor}`);
    }
  }
  try {
    for (const component of chain) {
      const kind = existingKind(component, runtime);
      if (kind === "missing") {
        try {
          runtime.mkdirSync(component, { mode: 0o755 });
          created.push(component);
        } catch (error) {
          if (error.code !== "EEXIST" || existingKind(component, runtime) !== "directory") throw error;
        }
      } else if (kind !== "directory") throw new Error(`unsafe directory path: ${component}`);
      if (component === target) assertSafePath(component, { finalKind: "directory", uid }, runtime);
    }
  } catch (error) {
    for (const component of created.reverse()) {
      try { if (runtime.readdirSync(component).length === 0) runtime.rmdirSync(component); } catch {}
    }
    throw error;
  }
  return created;
}

export function safeReleasePath(releases, releaseId) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+-[0-9a-f]{16}$/.test(releaseId)) {
    throw new Error("invalid release identifier");
  }
  const target = path.join(releases, releaseId);
  if (path.dirname(target) !== releases) throw new Error("release path escaped its directory");
  return target;
}
