// Verifies every canonical parent directory before artifact inspection can traverse it.
// The application directory is also checked for unmanaged entries left outside the package policy.
import fs from "node:fs";

const ROOT_DIRECTORY = Object.freeze({ uid: 0, gid: 0, mode: 0o755 });
const MANAGED_ENTRIES = Object.freeze(["printer.u220p", "printing.conf"]);

function blocked(path, required, blockedBy) {
  return { path, required, checked: false, exists: null, type: "unchecked",
    uid: null, gid: null, mode: null, metadataValid: false, safe: false,
    blockedBy, error: null };
}

function directoryType(stat) {
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "regular_file";
  return "other";
}

function inspectDirectory(path, required, runtime) {
  const lstat = runtime.lstat || fs.lstatSync;
  try {
    const stat = lstat(path);
    const mode = stat.mode & 0o7777;
    const type = directoryType(stat);
    const metadataValid = type === "directory" && stat.uid === ROOT_DIRECTORY.uid
      && stat.gid === ROOT_DIRECTORY.gid && mode === ROOT_DIRECTORY.mode;
    return { path, required, checked: true, exists: true, type,
      uid: stat.uid, gid: stat.gid, mode: mode.toString(8).padStart(4, "0"),
      metadataValid, safe: metadataValid, blockedBy: null, error: null };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { path, required, checked: true, exists: false, type: "absent",
        uid: null, gid: null, mode: null, metadataValid: false, safe: !required,
        blockedBy: null, error: null };
    }
    return { path, required, checked: true, exists: null, type: "unknown",
      uid: null, gid: null, mode: null, metadataValid: false, safe: false,
      blockedBy: null, error: String(error?.message || error).slice(0, 240) };
  }
}

function inspectManagedEntries(directory, runtime) {
  if (directory.exists !== true || !directory.safe) {
    return { checked: false, expected: [...MANAGED_ENTRIES], actual: [],
      missing: [...MANAGED_ENTRIES], unknown: [], exact: false,
      safe: directory.exists === false && directory.safe, error: null };
  }
  const readdir = runtime.readdir || ((path) => fs.readdirSync(path, { withFileTypes: true }));
  try {
    const actual = readdir(directory.path).map((value) =>
      String(typeof value === "string" ? value : value.name)).sort();
    const expected = [...MANAGED_ENTRIES];
    const unknown = actual.filter((value) => !MANAGED_ENTRIES.includes(value));
    const missing = MANAGED_ENTRIES.filter((value) => !actual.includes(value));
    return { checked: true, expected, actual, missing, unknown,
      exact: missing.length === 0 && unknown.length === 0,
      safe: unknown.length === 0, error: null };
  } catch (error) {
    return { checked: true, expected: [...MANAGED_ENTRIES], actual: [],
      missing: [...MANAGED_ENTRIES], unknown: [], exact: false, safe: false,
      error: String(error?.message || error).slice(0, 240) };
  }
}

export function auditPathSafety(runtime = {}) {
  const privateDirectory = inspectDirectory("/private", true, runtime);
  const etcDirectory = privateDirectory.safe
    ? inspectDirectory("/private/etc", true, runtime)
    : blocked("/private/etc", true, privateDirectory.path);
  const sudoersDirectory = etcDirectory.safe
    ? inspectDirectory("/private/etc/sudoers.d", true, runtime)
    : blocked("/private/etc/sudoers.d", true, etcDirectory.blockedBy || etcDirectory.path);
  const applicationDirectory = etcDirectory.safe
    ? inspectDirectory("/private/etc/tm-u220", false, runtime)
    : blocked("/private/etc/tm-u220", false, etcDirectory.blockedBy || etcDirectory.path);
  const directories = [privateDirectory, etcDirectory, sudoersDirectory, applicationDirectory];
  const managedEntries = inspectManagedEntries(applicationDirectory, runtime);
  const firstUnsafe = (values) => values.find((value) => !value.safe)?.path || null;
  return {
    safe: directories.every((value) => value.safe) && managedEntries.safe,
    expectedDirectory: { ...ROOT_DIRECTORY, mode: "0755" },
    directories, managedEntries,
    artifactParents: {
      configuration: { safe: !firstUnsafe([privateDirectory, etcDirectory, applicationDirectory]),
        blockedBy: firstUnsafe([privateDirectory, etcDirectory, applicationDirectory]) },
      authorization: { safe: !firstUnsafe([privateDirectory, etcDirectory, sudoersDirectory]),
        blockedBy: firstUnsafe([privateDirectory, etcDirectory, sudoersDirectory]) },
    },
  };
}
