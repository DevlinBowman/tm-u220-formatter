// Reads one bounded companion file while rejecting traversal, links, and replacement.
// Image format interpretation remains outside this filesystem-policy module.
import fs from "node:fs";
import path from "node:path";

const KNOWN_FAILURES = new Set([
  "DOCUMENT_INVALID", "REFERENCE_INVALID", "LINK_REJECTED", "FILE_INVALID",
  "SIZE_INVALID", "FILE_CHANGED",
]);

function unchanged(before, after) {
  return before.dev === after.dev && before.ino === after.ino
    && before.size === after.size && before.mtimeMs === after.mtimeMs;
}

function referenceParts(reference) {
  if (!reference || path.posix.isAbsolute(reference) || reference.startsWith("~")
      || reference.includes("\\") || reference.includes(":")
      || /[\0-\x1f\x7f]/u.test(reference)) return null;
  const parts = reference.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts;
}

function readFromRoot(root, reference, maximumBytes) {
  const parts = referenceParts(reference);
  if (!parts) throw new Error("REFERENCE_INVALID");

  let target = root;
  for (let index = 0; index < parts.length; index += 1) {
    target = path.join(target, parts[index]);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error("LINK_REJECTED");
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error("REFERENCE_INVALID");
    if (index === parts.length - 1 && (!stat.isFile() || stat.nlink !== 1)) {
      throw new Error("FILE_INVALID");
    }
  }

  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(target, flags);
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.size < 1 || before.size > maximumBytes) {
      throw new Error("SIZE_INVALID");
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    if (!unchanged(before, after) || bytes.length !== before.size) {
      throw new Error("FILE_CHANGED");
    }
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function readAsset(documentPath, reference, maximumBytes) {
  const absoluteDocument = path.resolve(documentPath);
  const document = fs.lstatSync(absoluteDocument);
  if (!document.isFile() || document.isSymbolicLink()) throw new Error("DOCUMENT_INVALID");
  return readFromRoot(fs.realpathSync(path.dirname(absoluteDocument)),
    reference, maximumBytes);
}

export function readRootAsset(rootPath, reference, maximumBytes) {
  const absoluteRoot = path.resolve(rootPath);
  const root = fs.lstatSync(absoluteRoot);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("DOCUMENT_INVALID");
  return readFromRoot(fs.realpathSync(absoluteRoot), reference, maximumBytes);
}

export function readFailureCode(error) {
  return KNOWN_FAILURES.has(error?.message) ? error.message : "READ_FAILED";
}
