// Builds complete canonical, legacy, and removed audit reports for removal tests.
// Fixtures contain no filesystem access, authorization request, or device traffic.
import {
  commandText, printingPolicy,
} from "../../libexec/printing_policy/index.mjs";

const HOST = "192.168.50.41";

function commands(host = HOST) {
  return printingPolicy.routes.flatMap((spec) => {
    const route = { ...spec, host, sourcePorts: [...spec.sourcePorts] };
    return route.sourcePorts.map((source) => commandText(route, source));
  });
}

function file(name, exists) {
  const definition = printingPolicy.artifacts[name];
  return { path: definition.path, exists, type: exists ? "regular_file" : "absent",
    uid: exists ? 0 : null, gid: exists ? 0 : null, links: exists ? 1 : null,
    mode: exists ? definition.mode.toString(8).padStart(4, "0") : null,
    size: exists ? 80 : null, metadataValid: exists, readable: exists,
    sha256: exists ? "a".repeat(64) : null, hashMatches: exists ? true : null,
    expected: { mode: definition.mode.toString(8).padStart(4, "0") },
    schema: { valid: exists }, error: null };
}

function paths(applicationExists) {
  return { safe: true, directories: [
    { path: "/private", exists: true, safe: true },
    { path: "/private/etc", exists: true, safe: true },
    { path: "/private/etc/sudoers.d", exists: true, safe: true },
    { path: "/private/etc/tm-u220", exists: applicationExists, safe: true },
  ], managedEntries: { safe: true, unknown: [] } };
}

function base() {
  return { healthy: false, environment: { platform: { supported: true }, dependencies: [] },
    pathSafety: paths(false), invokingAccount: { available: true, name: "sample_user", uid: 502,
      installedName: null, installedUid: null, matchesInstalled: null }, configuration: null,
    artifacts: { manifest: file("manifest", false), profile: file("profile", false),
      sudoers: file("sudoers", false), legacyTombstone: file("legacyTombstone", false) },
    packageReceipt: { queried: true, found: false, reportedIdentifier: null, version: null },
    authorization: { available: true, expected: [], active: [], missing: [], extra: [],
      extraDetails: [], misconfigured: [], broad: [], exact: false }, issues: [] };
}

export function canonicalReport() {
  const value = base();
  const expected = commands();
  value.healthy = true;
  value.pathSafety = paths(true);
  value.invokingAccount = { available: true, name: "sample_user", uid: 502,
    installedName: "sample_user", installedUid: 502, matchesInstalled: true };
  value.configuration = { endpoint: { host: HOST, port: 9100 } };
  for (const name of Object.keys(value.artifacts)) value.artifacts[name] = file(name, true);
  value.packageReceipt = { queried: true, found: true,
    reportedIdentifier: printingPolicy.package.identifier, version: "1.2.3" };
  value.authorization = { available: true, expected, active: [...expected], missing: [],
    extra: [], extraDetails: [], misconfigured: [], broad: [], exact: true };
  return value;
}

export function legacyReport(stale1022 = false) {
  const value = base();
  const legacy = commands();
  if (stale1022) legacy.push(`/usr/bin/nc -w 5 -p 1022 ${HOST} 515`);
  value.artifacts.sudoers = file("sudoers", true);
  value.artifacts.legacyTombstone = file("legacyTombstone", true);
  value.authorization.extra = legacy;
  value.authorization.extraDetails = legacy.map((command) =>
    ({ command, rootOnly: true, nopasswd: true, noexec: true, nosetenv: true }));
  return value;
}

export function removedReport() {
  return base();
}

export function captureIo() {
  let stdout = "";
  let stderr = "";
  return { io: { stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } } },
  stdout: () => stdout, stderr: () => stderr };
}
