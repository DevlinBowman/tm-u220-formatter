// Reads and atomically replaces one fixed user-owned profile without following links.
// Every operation revalidates ownership, mode, link count, size, and replacement races.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAXIMUM_BYTES = 64 * 1024;

function unchanged(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mtimeMs === right.mtimeMs;
}

function validateDirectory(target, uid) {
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid
      || (stat.mode & 0o022) !== 0) {
    throw new Error("image profile directory is not safely user-owned");
  }
}

function validateFile(target, uid) {
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
      || stat.uid !== uid || (stat.mode & 0o022) !== 0
      || stat.size < 1 || stat.size > MAXIMUM_BYTES) {
    throw new Error("image profile must be a private single-link regular file");
  }
  return stat;
}

function currentUid() {
  const uid = process.getuid?.();
  if (!Number.isInteger(uid) || uid < 1) throw new Error("image profile owner is unavailable");
  return uid;
}

export function revisionFor(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

export function readFixedProfile(target) {
  const uid = currentUid();
  validateDirectory(path.dirname(target), uid);
  const before = validateFile(target, uid);
  const descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(descriptor);
    if (!unchanged(before, opened)) throw new Error("image profile changed while opening");
    const source = fs.readFileSync(descriptor, "utf8");
    const after = fs.fstatSync(descriptor);
    if (!unchanged(opened, after) || Buffer.byteLength(source) !== opened.size) {
      throw new Error("image profile changed while reading");
    }
    return { source, revision: revisionFor(source), stat: before };
  } finally {
    fs.closeSync(descriptor);
  }
}

export function writeFixedProfile(target, source, expected) {
  if (typeof source !== "string" || Buffer.byteLength(source) < 1
      || Buffer.byteLength(source) > MAXIMUM_BYTES) {
    throw new Error("image profile source is outside the allowed size");
  }
  const uid = currentUid();
  validateDirectory(path.dirname(target), uid);
  const before = validateFile(target, uid);
  if (expected && !unchanged(before, expected)) {
    throw Object.assign(new Error("image profile changed on disk; reload before saving"),
      { status: 409 });
  }
  const temporary = path.join(path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let descriptor;
  try {
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
      | (fs.constants.O_NOFOLLOW || 0);
    descriptor = fs.openSync(temporary, flags, before.mode & 0o700);
    fs.writeFileSync(descriptor, source, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (!unchanged(before, validateFile(target, uid))) {
      throw Object.assign(new Error("image profile changed on disk; reload before saving"),
        { status: 409 });
    }
    fs.renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}
