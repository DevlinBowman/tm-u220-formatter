// Inspects protected setup artifacts without following symlinks or changing permissions.
// Bounded reads provide hashes while metadata remains reportable when contents are unreadable.
import { createHash } from "node:crypto";
import fs from "node:fs";

function kind(stat) {
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isFile()) return "regular_file";
  if (stat.isDirectory()) return "directory";
  return "other";
}

function secureRead(path, before, maximumBytes) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(path, flags);
  try {
    const after = fs.fstatSync(descriptor);
    if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) {
      throw Object.assign(new Error("file changed during inspection"), { code: "ESTALE" });
    }
    if (after.nlink !== undefined && after.nlink !== 1) {
      throw Object.assign(new Error("file must have exactly one filesystem link"), { code: "EMLINK" });
    }
    if (after.size > maximumBytes) {
      throw Object.assign(new Error(`file exceeds ${maximumBytes} bytes`), { code: "EFBIG" });
    }
    const bounded = Buffer.alloc(after.size + 1);
    let length = 0;
    while (length < bounded.length) {
      const count = fs.readSync(descriptor, bounded, length, bounded.length - length, null);
      if (count === 0) break;
      length += count;
    }
    const final = fs.fstatSync(descriptor);
    if (length !== after.size || final.dev !== after.dev || final.ino !== after.ino
        || final.size !== after.size || final.mtimeMs !== after.mtimeMs) {
      throw Object.assign(new Error("file changed while it was read"), { code: "ESTALE" });
    }
    return bounded.subarray(0, length);
  } finally {
    fs.closeSync(descriptor);
  }
}

function problem(error) {
  return {
    code: String(error?.code || "READ_ERROR"),
    message: String(error?.message || error || "inspection failed").slice(0, 240),
  };
}

function expectation(spec) {
  return {
    uid: spec.uid ?? null,
    gid: spec.gid ?? null,
    mode: spec.mode === undefined ? null : spec.mode.toString(8).padStart(4, "0"),
    size: spec.expectedSize ?? null,
    sha256: spec.expectedHash ?? null,
  };
}

export function inspectFile(spec, runtime = {}) {
  if (spec.blockedBy) {
    return { report: {
      path: spec.path, exists: null, type: "unchecked", uid: null, gid: null,
      mode: null, size: null, links: null, metadataValid: false, readable: false,
      sha256: null, hashMatches: spec.expectedHash ? false : null,
      expected: expectation(spec), error: {
        code: "UNSAFE_PARENT",
        message: `inspection stopped at unsafe parent ${spec.blockedBy}`,
      },
    }, bytes: null };
  }
  const lstat = runtime.lstat || fs.lstatSync;
  let stat;
  try {
    stat = lstat(spec.path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { report: {
        path: spec.path, exists: false, type: "absent", uid: null, gid: null,
        mode: null, size: null, links: null, metadataValid: false, readable: false,
        sha256: null, hashMatches: spec.expectedHash ? false : null,
        expected: expectation(spec), error: null,
      }, bytes: null };
    }
    return { report: {
      path: spec.path, exists: null, type: "unknown", uid: null, gid: null,
      mode: null, size: null, links: null, metadataValid: false, readable: false,
      sha256: null, hashMatches: spec.expectedHash ? false : null,
      expected: expectation(spec), error: problem(error),
    }, bytes: null };
  }

  const type = kind(stat);
  const mode = stat.mode & 0o7777;
  const metadataValid = type === "regular_file"
    && (stat.nlink === undefined || stat.nlink === 1)
    && (spec.uid === undefined || stat.uid === spec.uid)
    && (spec.gid === undefined || stat.gid === spec.gid)
    && (spec.mode === undefined || mode === spec.mode)
    && (spec.expectedSize === undefined || stat.size === spec.expectedSize);
  const report = {
    path: spec.path, exists: true, type, uid: stat.uid, gid: stat.gid,
    links: stat.nlink ?? null,
    mode: mode.toString(8).padStart(4, "0"), size: stat.size,
    metadataValid, readable: false, sha256: null,
    hashMatches: spec.expectedHash ? false : null,
    expected: expectation(spec), error: null,
  };
  if (!spec.read || type !== "regular_file") return { report, bytes: null };

  try {
    const maximumBytes = spec.maxBytes ?? 4096;
    if (stat.size > maximumBytes) {
      throw Object.assign(new Error(`file exceeds ${maximumBytes} bytes`), { code: "EFBIG" });
    }
    const readFile = runtime.readFile || secureRead;
    const bytes = readFile(spec.path, stat, maximumBytes);
    if (!Buffer.isBuffer(bytes)) throw new Error("file reader did not return bytes");
    if (bytes.length !== stat.size) {
      throw Object.assign(new Error("file changed while it was read"), { code: "ESTALE" });
    }
    report.readable = true;
    report.sha256 = createHash("sha256").update(bytes).digest("hex");
    report.hashMatches = spec.expectedHash ? report.sha256 === spec.expectedHash : null;
    return { report, bytes };
  } catch (error) {
    report.error = problem(error);
    return { report, bytes: null };
  }
}
