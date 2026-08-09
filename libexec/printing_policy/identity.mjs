// Captures the real current account that will receive printing authorization.
// Setup is rejected when invoked as root or when runtime UID claims disagree.
import os from "node:os";
import { exactInteger, freezePolicy, validateAccountName } from "./validation.mjs";

export function normalizeIdentity(value) {
  if (!value || typeof value !== "object") throw new Error("account identity is required");
  const name = validateAccountName(value.name ?? value.username);
  const uid = exactInteger(value.uid, "account UID", 1, 2147483647);
  return freezePolicy({ name, uid });
}

export function captureCurrentIdentity(runtime = {}) {
  const userInfo = runtime.userInfo || (() => os.userInfo());
  const getuid = runtime.getuid || (() => process.getuid?.());
  const geteuid = runtime.geteuid || (() => process.geteuid?.());
  const info = userInfo();
  const identity = normalizeIdentity({ name: info?.username, uid: info?.uid });
  const realUid = getuid();
  const effectiveUid = geteuid();
  if (realUid === undefined || effectiveUid === undefined) {
    throw new Error("setup requires a POSIX runtime that exposes real and effective UIDs");
  }
  if (realUid !== identity.uid || effectiveUid !== identity.uid) {
    throw new Error("account identity does not match the process real and effective UIDs");
  }
  return identity;
}
