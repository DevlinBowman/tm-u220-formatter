// Seeds user-owned configuration from bundled templates without following or overwriting files.
// The dedicated application directories and every editable file remain single-link regular objects.
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 1024 * 1024;

function missing(error) {
  return error?.code === "ENOENT";
}

function statOrNull(target, runtime) {
  try { return runtime.lstatSync(target); }
  catch (error) { if (missing(error)) return null; throw error; }
}

function validateDirectory(target, uid, runtime) {
  const stat = runtime.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`configuration directory must not be a symlink: ${target}`);
  }
  if (stat.uid !== uid) throw new Error(`configuration directory has the wrong owner: ${target}`);
  if ((stat.mode & 0o022) !== 0) {
    throw new Error(`configuration directory is group- or world-writable: ${target}`);
  }
}

function ensureDirectory(target, uid, runtime) {
  if (!statOrNull(target, runtime)) runtime.mkdirSync(target, { recursive: true, mode: 0o700 });
  validateDirectory(target, uid, runtime);
}

function validateRegularFile(target, label, uid, runtime, requireOwner = true) {
  const stat = runtime.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file and not a symbolic link`);
  }
  if (stat.nlink !== undefined && stat.nlink !== 1) {
    throw new Error(`${label} must have exactly one filesystem link`);
  }
  if (requireOwner && stat.uid !== uid) throw new Error(`${label} has the wrong owner`);
  if (requireOwner && (stat.mode & 0o022) !== 0) {
    throw new Error(`${label} is group- or world-writable`);
  }
  if (stat.size < 1 || stat.size > MAX_BYTES) {
    throw new Error(`${label} byte length is outside the allowed range`);
  }
  return stat;
}

function templateBytes(file, runtime) {
  validateRegularFile(file.factoryPath, `bundled ${file.label}`, undefined, runtime, false);
  const bytes = runtime.readFileSync(file.factoryPath);
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_BYTES) {
    throw new Error(`bundled ${file.label} returned invalid bytes`);
  }
  return bytes;
}

function seedFile(file, uid, runtime) {
  if (!statOrNull(file.path, runtime)) {
    const bytes = templateBytes(file, runtime);
    try {
      runtime.writeFileSync(file.path, bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  validateRegularFile(file.path, file.label, uid, runtime);
}

export function prepareConfiguration(files, options = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("configuration file set is empty");
  }
  const runtime = options.runtime || fs;
  const uid = options.uid ?? process.getuid?.();
  if (!Number.isInteger(uid) || uid < 1) {
    throw new Error("run 220 config as your normal user, not root or sudo");
  }

  const ownership = new Set(files.map((file) => file.userOwned === true));
  if (ownership.size !== 1) throw new Error("configuration file ownership modes are mixed");
  if (!files[0].userOwned) {
    for (const file of files) validateRegularFile(file.path, file.label, uid, runtime);
    return Object.freeze(files.map((file) => file.path));
  }

  const root = path.dirname(path.dirname(files[0].path));
  ensureDirectory(root, uid, runtime);
  const directories = [...new Set(files.map((file) => path.dirname(file.path)))];
  for (const directory of directories) ensureDirectory(directory, uid, runtime);
  for (const file of files) seedFile(file, uid, runtime);
  return Object.freeze(files.map((file) => file.path));
}
