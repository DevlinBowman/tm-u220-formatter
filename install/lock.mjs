// Serializes install mutations with attributable metadata and safely recovers exact stale locks.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { existingKind } from "./layout.mjs";
import { safeReadFile } from "./source.mjs";

const LOCK_SCHEMA = "tm-u220-install-lock-1";
const OWNER_FILE = "owner.json";
const STALE_NAME = /^\.tm-u220-install\.lock\.stale-[0-9a-f-]{36}$/;

function bytes(metadata) {
  return Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function processActive(pid, probe = process.kill) {
  try { probe(pid, 0); return true; }
  catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

export function inspectInstallLock(layout, options = {}) {
  const runtime = options.runtime || fs;
  const uid = options.uid ?? process.getuid?.();
  const kind = existingKind(layout.lock, runtime);
  if (kind === "missing") return { present: false, valid: true, active: false,
    stale: false, metadata: null, issues: [] };
  const issues = [];
  if (kind !== "directory") issues.push("install lock is not a directory");
  let metadata = null;
  if (kind === "directory") {
    const stat = runtime.lstatSync(layout.lock);
    if (uid !== undefined && stat.uid !== uid) issues.push("install lock has the wrong owner");
    if ((stat.mode & 0o777) !== 0o700) issues.push("install lock has the wrong mode");
    const entries = runtime.readdirSync(layout.lock);
    if (entries.length !== 1 || entries[0] !== OWNER_FILE) issues.push("install lock contents are invalid");
    if (entries.length === 1 && entries[0] === OWNER_FILE) {
      const ownerPath = path.join(layout.lock, OWNER_FILE);
      try {
        const ownerStat = runtime.lstatSync(ownerPath);
        if (!ownerStat.isFile() || ownerStat.isSymbolicLink() || ownerStat.nlink !== 1) {
          throw new Error("owner metadata is not one regular file");
        }
        if (uid !== undefined && ownerStat.uid !== uid) throw new Error("owner metadata has wrong owner");
        if ((ownerStat.mode & 0o777) !== 0o600) throw new Error("owner metadata has wrong mode");
        const raw = safeReadFile(ownerPath, 4096, runtime);
        metadata = JSON.parse(raw.toString("utf8"));
        const keys = Object.keys(metadata).sort().join(",");
        if (keys !== "nonce,pid,schema,startedAt" || metadata.schema !== LOCK_SCHEMA
            || !Number.isSafeInteger(metadata.pid) || metadata.pid < 1
            || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
              metadata.nonce || "")
            || new Date(metadata.startedAt).toISOString() !== metadata.startedAt
            || !raw.equals(bytes(metadata))) throw new Error("owner metadata is not canonical");
      } catch (error) { issues.push(`invalid install lock metadata: ${error.message}`); }
    }
  }
  const valid = issues.length === 0 && metadata !== null;
  const active = valid && processActive(metadata.pid, options.probePid);
  return { present: true, valid, active, stale: valid && !active, metadata, issues };
}

export function inspectLockResidues(layout, runtime = fs) {
  const paths = [];
  if (existingKind(layout.lockRecovery, runtime) !== "missing") paths.push(layout.lockRecovery);
  if (existingKind(layout.library, runtime) === "directory") {
    for (const name of runtime.readdirSync(layout.library)) {
      if (STALE_NAME.test(name)) paths.push(path.join(layout.library, name));
    }
  }
  paths.sort();
  return { present: paths.length > 0, paths };
}

function recoverStale(layout, observed, options, runtime) {
  try { runtime.mkdirSync(layout.lockRecovery, { mode: 0o700 }); }
  catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
  const quarantine = `${layout.lock}.stale-${observed.metadata.nonce}`;
  try {
    const current = inspectInstallLock(layout, { ...options, runtime });
    if (!current.stale || current.metadata.nonce !== observed.metadata.nonce) return false;
    if (existingKind(quarantine, runtime) !== "missing") {
      throw new Error(`stale lock quarantine already exists: ${quarantine}`);
    }
    runtime.renameSync(layout.lock, quarantine);
    const quarantined = inspectInstallLock({ ...layout, lock: quarantine }, { ...options, runtime });
    if (!quarantined.stale || quarantined.metadata.nonce !== observed.metadata.nonce) {
      throw new Error("quarantined lock identity changed during recovery");
    }
    runtime.unlinkSync(path.join(quarantine, OWNER_FILE));
    runtime.rmdirSync(quarantine);
    return true;
  } finally { runtime.rmdirSync(layout.lockRecovery); }
}

export function acquireInstallLock(layout, options = {}) {
  const runtime = options.runtime || fs;
  const uid = options.uid ?? process.getuid?.();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const residues = inspectLockResidues(layout, runtime);
    if (residues.present) {
      throw new Error(`install lock recovery residue requires manual inspection: ${residues.paths.join(", ")}`);
    }
    try {
      runtime.mkdirSync(layout.lock, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const report = inspectInstallLock(layout, { ...options, runtime, uid });
      if (report.stale && attempt === 0) {
        if (recoverStale(layout, report, { ...options, uid }, runtime)) continue;
        throw new Error("another process is recovering the install lock");
      }
      if (report.active) throw new Error(`another install is active (PID ${report.metadata.pid})`);
      throw new Error(`install lock requires manual inspection: ${report.issues.join("; ")}`);
    }
    const metadata = { schema: LOCK_SCHEMA, pid: options.pid || process.pid,
      startedAt: (options.now || (() => new Date()))().toISOString(),
      nonce: (options.randomUUID || randomUUID)() };
    const ownerPath = path.join(layout.lock, OWNER_FILE);
    try {
      runtime.writeFileSync(ownerPath, bytes(metadata), { flag: "wx", mode: 0o600 });
      runtime.chmodSync(ownerPath, 0o600);
    } catch (error) {
      try { if (existingKind(ownerPath, runtime) === "file") runtime.unlinkSync(ownerPath); } catch {}
      try { runtime.rmdirSync(layout.lock); } catch {}
      throw error;
    }
    return { metadata, release() {
      const report = inspectInstallLock(layout, { ...options, runtime, uid });
      if (!report.valid || report.metadata.nonce !== metadata.nonce) {
        throw new Error("install lock ownership changed before release");
      }
      runtime.unlinkSync(ownerPath);
      runtime.rmdirSync(layout.lock);
    } };
  }
  throw new Error("could not acquire install lock");
}
