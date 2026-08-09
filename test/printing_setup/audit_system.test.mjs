// Verifies canonical artifact, receipt, and effective-command auditing without host changes.
import test from "node:test";
import assert from "node:assert/strict";
import { auditPrintingSetup } from "../../libexec/printing_setup/audit.mjs";
import * as policyApi from "../../libexec/printing_policy/index.mjs";

const profileBytes = Buffer.from([
  "!tm-u220 profile 1", "variant=B", "paper=76",
  "dip2_1=off", "cutter=partial", "",
].join("\n"));
const manifest = policyApi.createManifest({
  identity: { name: "alice", uid: 501 },
  host: "192.168.1.220",
  profile: profileBytes,
  probe: { mode: "verified", recordedAt: "2026-08-08T12:34:56.000Z",
    model: "TM-U220", modelId: 13 },
});
const sudoers = policyApi.renderSudoers(manifest);
const tombstone = policyApi.renderLegacyTombstone();

function fakeStat(bytes, mode) {
  return {
    uid: 0, gid: 0, mode: 0o100000 | mode, size: bytes.length, dev: 1, ino: bytes.length,
    isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false,
  };
}

function fakeDirectory() {
  return { uid: 0, gid: 0, mode: 0o040755, size: 128,
    isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false };
}

const CANONICAL_DIRECTORIES = new Set([
  "/private", "/private/etc", "/private/etc/sudoers.d", "/private/etc/tm-u220",
]);

function sudoListing(commands, options = "!setenv, noexec, !authenticate") {
  return commands.map((command) => [
    "Sudoers entry:", "    RunAsUsers: root", `    Options: ${options}`,
    "    Commands:", `        ${command}`,
  ].join("\n")).join("\n\n");
}

function runtime(overrides = {}) {
  const files = new Map([
    [policyApi.printingPolicy.artifacts.manifest.path, manifest.bytes],
    [policyApi.printingPolicy.artifacts.profile.path, profileBytes],
    [policyApi.printingPolicy.artifacts.sudoers.path, sudoers.bytes],
    [policyApi.printingPolicy.artifacts.legacyTombstone.path, tombstone.bytes],
  ]);
  const modes = new Map(Object.entries(policyApi.printingPolicy.artifacts)
    .map(([, spec]) => [spec.path, spec.mode]));
  return {
    platform: "darwin",
    userInfo: () => ({ username: "alice", uid: 501 }),
    getuid: () => 501,
    geteuid: () => 501,
    inspectExecutable: () => ({ exists: true, regularFile: true, executable: true }),
    lstat: (path) => {
      if (CANONICAL_DIRECTORIES.has(path)) return fakeDirectory();
      if (!files.has(path)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return fakeStat(files.get(path), modes.get(path));
    },
    readdir: () => ["printer.u220p", "printing.conf"],
    readFile: (path) => Buffer.from(files.get(path)),
    spawnSync: (executable) => executable === "/usr/bin/sudo"
      ? { status: 0, stdout: sudoListing(sudoers.commands), stderr: "" }
      : { status: 0, stdout: "package-id: org.tm-u220.printing-policy\nversion: 1.2.3\n",
        stderr: "" },
    ...overrides,
  };
}

test("complete canonical local state reports exact hashes and commands", () => {
  const report = auditPrintingSetup(policyApi, runtime());
  assert.equal(report.kind, "tm-u220-printing-status");
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.localOnly, true);
  assert.equal(report.device, null);
  assert.equal(report.healthy, true);
  assert.equal(report.pathSafety.safe, true);
  assert.equal(report.pathSafety.managedEntries.exact, true);
  assert.deepEqual(report.invokingAccount, {
    checked: true, available: true, name: "alice", uid: 501,
    installedName: "alice", installedUid: 501,
    nameMatchesInstalled: true, uidMatchesInstalled: true,
    matchesInstalled: true, error: null,
  });
  assert.deepEqual(report.issues, []);
  assert.equal(report.artifacts.manifest.schema.valid, true);
  assert.equal(report.artifacts.manifest.sha256, manifest.hash);
  assert.equal(report.artifacts.profile.hashMatches, true);
  assert.equal(report.artifacts.sudoers.expected.sha256, sudoers.hash);
  assert.equal(report.artifacts.sudoers.readable, false);
  assert.equal(report.authorization.expected.length, 19);
  assert.equal(report.authorization.exact, true);
  assert.deepEqual(report.configuration.endpoint, { host: "192.168.1.220", port: 9100 });
});

test("a wrong invoking UID cannot inherit another account's healthy status", () => {
  const report = auditPrintingSetup(policyApi, runtime({
    userInfo: () => ({ username: "alice", uid: 502 }),
    getuid: () => 502, geteuid: () => 502,
  }));
  assert.equal(report.healthy, false);
  assert.equal(report.invokingAccount.nameMatchesInstalled, true);
  assert.equal(report.invokingAccount.uidMatchesInstalled, false);
  assert.equal(report.invokingAccount.matchesInstalled, false);
  assert.ok(report.issues.some((value) => value.code === "INVOKING_ACCOUNT_UID_MISMATCH"));
  assert.equal(report.issues.some((value) =>
    value.code === "INVOKING_ACCOUNT_NAME_MISMATCH"), false);
});

test("a wrong invoking account name cannot reuse a matching numeric grant set", () => {
  const report = auditPrintingSetup(policyApi, runtime({
    userInfo: () => ({ username: "bob", uid: 501 }),
    getuid: () => 501, geteuid: () => 501,
  }));
  assert.equal(report.healthy, false);
  assert.equal(report.invokingAccount.nameMatchesInstalled, false);
  assert.equal(report.invokingAccount.uidMatchesInstalled, true);
  assert.equal(report.invokingAccount.matchesInstalled, false);
  assert.ok(report.issues.some((value) => value.code === "INVOKING_ACCOUNT_NAME_MISMATCH"));
  assert.equal(report.issues.some((value) => value.code === "INVOKING_ACCOUNT_UID_MISMATCH"), false);
});

test("the historical port 1022 grant is an extra, never healthy", () => {
  const legacyCommand = "/usr/bin/nc -w 5 -p 1022 192.168.1.220 515";
  const report = auditPrintingSetup(policyApi, runtime({
    spawnSync: (executable) => executable === "/usr/bin/sudo"
      ? { status: 0, stdout: sudoListing([...sudoers.commands, legacyCommand]), stderr: "" }
      : { status: 0,
        stdout: "package-id: org.tm-u220.printing-policy\nversion: 1.2.3\n", stderr: "" },
  }));
  assert.equal(report.healthy, false);
  assert.deepEqual(report.authorization.extra, [legacyCommand]);
  assert.equal(report.authorization.exact, false);
  assert.ok(report.issues.some((value) => value.code === "SUDO_COMMANDS_EXTRA"));
  assert.ok(report.issues.some((value) => value.code === "LEGACY_1022_COMMAND_ACTIVE"));
});

test("unsafe manifest type fails closed without parsing or following it", () => {
  const readPaths = [];
  const report = auditPrintingSetup(policyApi, runtime({
    lstat: (path) => path === policyApi.printingPolicy.artifacts.manifest.path
      ? { uid: 0, gid: 0, mode: 0o120777, size: 10,
        isFile: () => false, isDirectory: () => false, isSymbolicLink: () => true }
      : CANONICAL_DIRECTORIES.has(path) ? fakeDirectory()
      : fakeStat(new Map([
        [policyApi.printingPolicy.artifacts.profile.path, profileBytes],
        [policyApi.printingPolicy.artifacts.sudoers.path, sudoers.bytes],
        [policyApi.printingPolicy.artifacts.legacyTombstone.path, tombstone.bytes],
      ]).get(path), new Map(Object.values(policyApi.printingPolicy.artifacts)
        .map((spec) => [spec.path, spec.mode])).get(path)),
    readFile: (path) => { readPaths.push(path); return Buffer.from(profileBytes); },
  }));
  assert.equal(readPaths.includes(policyApi.printingPolicy.artifacts.manifest.path), false);
  assert.equal(report.artifacts.manifest.type, "symlink");
  assert.equal(report.artifacts.manifest.readable, false);
  assert.ok(report.issues.some((value) => value.code === "MANIFEST_METADATA"));
  assert.ok(report.issues.some((value) => value.code === "MANIFEST_SCHEMA_INVALID"));
});

test("an unsafe intermediate directory blocks all descendant artifact inspection", () => {
  const touched = [];
  const base = runtime();
  const report = auditPrintingSetup(policyApi, {
    ...base,
    lstat: (path) => {
      touched.push(path);
      if (path === "/private/etc") {
        return { uid: 0, gid: 0, mode: 0o120777, size: 10,
          isFile: () => false, isDirectory: () => false, isSymbolicLink: () => true };
      }
      return base.lstat(path);
    },
  });
  assert.equal(report.pathSafety.safe, false);
  assert.equal(report.artifacts.manifest.type, "unchecked");
  assert.equal(report.artifacts.sudoers.type, "unchecked");
  assert.equal(touched.some((path) => path.startsWith("/private/etc/")
    && path !== "/private/etc"), false);
  assert.ok(report.issues.some((value) => value.code === "CANONICAL_PARENT_UNSAFE"));
});

test("unmanaged application-directory entries are visible and unhealthy", () => {
  const report = auditPrintingSetup(policyApi, runtime({
    readdir: () => ["printer.u220p", "printing.conf", "unmanaged.conf"],
  }));
  assert.equal(report.pathSafety.safe, false);
  assert.deepEqual(report.pathSafety.managedEntries.unknown, ["unmanaged.conf"]);
  assert.ok(report.issues.some((value) => value.code === "MANAGED_DIRECTORY_UNEXPECTED_ENTRY"));
});

test("profile bytes must retain the hash recorded by the manifest", () => {
  const changed = Buffer.from(profileBytes);
  changed[changed.length - 2] = changed[changed.length - 2] === 0x6c ? 0x78 : 0x6c;
  const base = runtime();
  const report = auditPrintingSetup(policyApi, {
    ...base,
    readFile: (path) => path === policyApi.printingPolicy.artifacts.profile.path
      ? changed : base.readFile(path),
  });
  assert.equal(report.artifacts.profile.hashMatches, false);
  assert.equal(report.healthy, false);
  assert.ok(report.issues.some((value) => value.code === "PROFILE_HASH_MISMATCH"));
});

test("a broad passwordless root rule prevents a healthy audit", () => {
  const report = auditPrintingSetup(policyApi, runtime({
    spawnSync: (executable) => executable === "/usr/bin/sudo"
      ? { status: 0, stdout: `${sudoListing(sudoers.commands)}\n\n${sudoListing(["ALL"])}`,
        stderr: "" }
      : { status: 0,
        stdout: "package-id: org.tm-u220.printing-policy\nversion: 1.2.3\n", stderr: "" },
  }));
  assert.equal(report.healthy, false);
  assert.deepEqual(report.authorization.broad, ["ALL"]);
  assert.ok(report.issues.some((value) => value.code === "SUDO_BROAD_NETCAT_GRANT"));
});
