// Reads allowlisted source files without following symlinks and stages their exact reviewed bytes.
import fs from "node:fs";
import path from "node:path";
import { createManifest, sha256, validPayloadPath } from "./manifest.mjs";

function assertUnsymbolicDirectoryChain(target, runtime) {
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = runtime.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`symlinked or invalid source directory: ${current}`);
    }
  }
}

export function safeReadFile(target, maximum = 16 * 1024 * 1024, runtime = fs) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  let descriptor;
  try {
    descriptor = runtime.openSync(target, flags);
    const before = runtime.fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1 || before.size > maximum) {
      throw new Error(`unsafe regular file: ${target}`);
    }
    const bytes = runtime.readFileSync(descriptor);
    const after = runtime.fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino || before.nlink !== after.nlink
        || after.nlink !== 1 || before.size !== after.size
        || bytes.length !== after.size) throw new Error(`file changed while read: ${target}`);
    return bytes;
  } catch (error) {
    if (["ELOOP", "EMLINK"].includes(error.code)) {
      throw new Error(`refusing symlinked source file: ${target}`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) runtime.closeSync(descriptor);
  }
}

export function validatePayload(payload) {
  if (!Array.isArray(payload) || payload.length === 0) throw new Error("payload allowlist is empty");
  const seen = new Set();
  for (const entry of payload) {
    if (!entry || !validPayloadPath(entry.path) || ![0o644, 0o755].includes(entry.mode)) {
      throw new Error("payload allowlist contains an invalid entry");
    }
    if (seen.has(entry.path)) throw new Error(`duplicate payload allowlist entry: ${entry.path}`);
    seen.add(entry.path);
  }
  return [...payload].sort((left, right) => left.path.localeCompare(right.path));
}

export function prepareSource(sourceRoot, payload, version, runtime = fs) {
  const files = new Map();
  const resolvedRoot = path.resolve(sourceRoot);
  assertUnsymbolicDirectoryChain(resolvedRoot, runtime);
  const allowed = validatePayload(payload);
  const records = allowed.map((entry) => {
    const target = path.join(resolvedRoot, ...entry.path.split("/"));
    if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error(`payload path escaped source root: ${entry.path}`);
    }
    let component = resolvedRoot;
    for (const part of entry.path.split("/").slice(0, -1)) {
      component = path.join(component, part);
      const stat = runtime.lstatSync(component);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`symlinked or invalid source directory: ${component}`);
      }
    }
    const bytes = safeReadFile(target, undefined, runtime);
    files.set(entry.path, bytes);
    return { ...entry, bytes: bytes.length, sha256: sha256(bytes) };
  });
  for (const entry of allowed) {
    const target = path.join(resolvedRoot, ...entry.path.split("/"));
    assertUnsymbolicDirectoryChain(path.dirname(target), runtime);
    const second = safeReadFile(target, undefined, runtime);
    if (!second.equals(files.get(entry.path))) {
      throw new Error(`source changed during the two-pass snapshot: ${entry.path}`);
    }
  }
  return Object.freeze({ manifest: createManifest(records, version), files });
}

function ensureStageDirectory(stageRoot, relativeDirectory, runtime) {
  let current = stageRoot;
  for (const part of relativeDirectory.split("/").filter(Boolean)) {
    current = path.join(current, part);
    try { runtime.mkdirSync(current, { mode: 0o755 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const stat = runtime.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`unsafe stage path: ${current}`);
    runtime.chmodSync(current, 0o755);
  }
}

export function writePreparedRelease(stageRoot, prepared, runtime = fs) {
  for (const entry of prepared.manifest.payload) {
    ensureStageDirectory(stageRoot, path.posix.dirname(entry.path), runtime);
    const target = path.join(stageRoot, ...entry.path.split("/"));
    const bytes = prepared.files.get(entry.path);
    if (!bytes || sha256(bytes) !== entry.sha256) throw new Error(`source drift: ${entry.path}`);
    runtime.writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
    runtime.chmodSync(target, entry.mode);
  }
}
