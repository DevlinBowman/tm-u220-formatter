// Reads security-sensitive files through non-following file descriptors and validates metadata.
// Callers can require installed ownership/modes without trusting path-based preflight alone.
import fs from "node:fs";

export function readConstrainedFile(filePath, constraints, runtime = {}) {
  if (runtime.readConstrainedFile) return runtime.readConstrainedFile(filePath, constraints);
  const lstat = runtime.lstat || fs.lstatSync;
  const open = runtime.open || fs.openSync;
  const fstat = runtime.fstat || fs.fstatSync;
  const readFile = runtime.readFileDescriptor || fs.readFileSync;
  const close = runtime.close || fs.closeSync;
  const before = lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`${constraints.label} must be a regular file and not a symbolic link`);
  }
  if (before.nlink !== undefined && before.nlink !== 1) {
    throw new Error(`${constraints.label} must have exactly one filesystem link`);
  }
  const noFollow = (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
  let descriptor;
  try {
    descriptor = open(filePath, fs.constants.O_RDONLY | noFollow);
  } catch (error) {
    if (error?.code === "ELOOP") throw new Error(`${constraints.label} must not be a symbolic link`);
    throw error;
  }
  try {
    const stat = fstat(descriptor);
    if (!stat.isFile()) throw new Error(`${constraints.label} must be a regular file`);
    if (before.dev !== stat.dev || before.ino !== stat.ino) {
      throw new Error(`${constraints.label} changed while it was being opened`);
    }
    if (stat.nlink !== undefined && stat.nlink !== 1) {
      throw new Error(`${constraints.label} must have exactly one filesystem link`);
    }
    if (stat.size < 1 || stat.size > constraints.maxBytes) {
      throw new Error(`${constraints.label} byte length is outside the allowed range`);
    }
    if (constraints.uid !== undefined && stat.uid !== constraints.uid) {
      throw new Error(`${constraints.label} has the wrong owner`);
    }
    if (constraints.gid !== undefined && stat.gid !== constraints.gid) {
      throw new Error(`${constraints.label} has the wrong group`);
    }
    if (constraints.mode !== undefined && (stat.mode & 0o777) !== constraints.mode) {
      throw new Error(`${constraints.label} has the wrong mode`);
    }
    const bytes = readFile(descriptor);
    if (!Buffer.isBuffer(bytes) || bytes.length !== stat.size) {
      throw new Error(`${constraints.label} changed while it was being read`);
    }
    return Object.freeze({ bytes, stat });
  } finally {
    close(descriptor);
  }
}
