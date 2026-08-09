// Verifies immutable staging, atomic activation, rollback, and repo-relative launcher behavior.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DISTRIBUTION_PAYLOAD } from "../../install/cli.mjs";
import { inspectInstallation } from "../../install/inspect.mjs";
import { APPLICATION_VERSION } from "../../install/manifest.mjs";
import { installRelease } from "../../install/transaction.mjs";
import { acquireInstallLock } from "../../install/lock.mjs";
import { ensureDirectory, installationLayout } from "../../install/layout.mjs";
import { runConfiguration } from "../../libexec/configuration/cli.mjs";

const versionParts = APPLICATION_VERSION.split(".").map(Number);
const PATCH_UPGRADE = `${versionParts[0]}.${versionParts[1]}.${versionParts[2] + 1}`;

function fixture(content = "one\n") {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "tm-u220-install-test-"));
  const sourceRoot = path.join(base, "source");
  fs.mkdirSync(path.join(sourceRoot, "app"), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, "app", "runtime.txt"), content);
  return { base, sourceRoot, prefix: path.join(base, "prefix"),
    payload: [{ path: "app/runtime.txt", mode: 0o644 }] };
}

test("installs and upgrades through one atomic current link", () => {
  const item = fixture();
  try {
    const first = installRelease(item);
    assert.equal(first.created, true);
    assert.equal(inspectInstallation(item.prefix).healthy, true);
    fs.writeFileSync(path.join(item.sourceRoot, "app/runtime.txt"), "two\n");
    const second = installRelease({ ...item, version: PATCH_UPGRADE });
    assert.notEqual(first.manifest.releaseId, second.manifest.releaseId);
    assert.equal(fs.readlinkSync(path.join(item.prefix, "lib/tm-u220/current")),
      `releases/${second.manifest.releaseId}`);
    assert.equal(inspectInstallation(item.prefix).healthy, true);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("refuses same-version rebuilds and semantic downgrades", () => {
  const item = fixture();
  try {
    installRelease({ ...item, version: "1.2.3" });
    fs.writeFileSync(path.join(item.sourceRoot, "app/runtime.txt"), "new bytes\n");
    assert.throws(() => installRelease({ ...item, version: "1.2.3" }), /same-version/);
    assert.throws(() => installRelease({ ...item, version: "1.2.2" }), /downgrade/);
    assert.equal(inspectInstallation(item.prefix).release.manifest.applicationVersion, "1.2.3");
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("refuses a foreign launcher instead of overwriting it", () => {
  const item = fixture();
  try {
    fs.mkdirSync(path.join(item.prefix, "bin"), { recursive: true });
    fs.writeFileSync(path.join(item.prefix, "bin/220"), "user file\n");
    assert.throws(() => installRelease(item), /non-symlink/);
    assert.equal(fs.readFileSync(path.join(item.prefix, "bin/220"), "utf8"), "user file\n");
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("a losing concurrent fresh installer never cleans the winner's managed directories", () => {
  const item = fixture();
  const layout = installationLayout(item.prefix);
  try {
    for (const target of [layout.prefix, layout.bin, layout.library,
      layout.managedRoot, layout.releases]) ensureDirectory(target);
    const winner = acquireInstallLock(layout);
    try {
      assert.throws(() => installRelease(item), /another install is active/);
      assert.equal(fs.statSync(layout.managedRoot).isDirectory(), true);
      assert.equal(fs.statSync(layout.releases).isDirectory(), true);
    } finally { winner.release(); }
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("a bootstrap failure preserves base directories another installer may already share", () => {
  const item = fixture();
  try {
    let creates = 0;
    const runtime = { ...fs, mkdirSync: (...args) => {
      creates += 1;
      if (creates === 3) throw Object.assign(new Error("simulated bootstrap failure"), { code: "EIO" });
      return fs.mkdirSync(...args);
    } };
    assert.throws(() => installRelease({ ...item, runtime }), /bootstrap failure/);
    assert.equal(fs.statSync(item.prefix).isDirectory(), true);
    assert.equal(fs.statSync(path.join(item.prefix, "bin")).isDirectory(), true);
    assert.equal(fs.existsSync(path.join(item.prefix, "lib/tm-u220")), false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("the transaction API rejects root execution", () => {
  const item = fixture();
  try {
    assert.throws(() => installRelease({ ...item, uid: 0 }), /normal user/);
    assert.throws(() => installRelease({ ...item, platform: "linux" }), /only on macOS/);
  }
  finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("rejects symlinked source files and prefix components", () => {
  const item = fixture();
  try {
    const outside = path.join(item.base, "outside.txt");
    fs.writeFileSync(outside, "outside\n");
    fs.unlinkSync(path.join(item.sourceRoot, "app/runtime.txt"));
    fs.symlinkSync(outside, path.join(item.sourceRoot, "app/runtime.txt"));
    assert.throws(() => installRelease(item), /symlink/);

    const realPrefix = path.join(item.base, "real-prefix");
    const linkedPrefix = path.join(item.base, "linked-prefix");
    fs.mkdirSync(realPrefix);
    fs.symlinkSync(realPrefix, linkedPrefix);
    fs.unlinkSync(path.join(item.sourceRoot, "app/runtime.txt"));
    fs.writeFileSync(path.join(item.sourceRoot, "app/runtime.txt"), "safe\n");
    assert.throws(() => installRelease({ ...item, prefix: linkedPrefix }), /symlink/);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("rejects multiply-linked source files", () => {
  const item = fixture();
  try {
    fs.linkSync(path.join(item.sourceRoot, "app/runtime.txt"), path.join(item.base, "second-link"));
    assert.throws(() => installRelease(item), /unsafe regular file/);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("rejects writable shared ancestors before creating any prefix residue", () => {
  const item = fixture();
  try {
    const shared = path.join(item.base, "shared");
    const privateBarrier = path.join(shared, "private");
    const unsafePrefix = path.join(privateBarrier, "new-prefix");
    fs.mkdirSync(shared, { mode: 0o777 });
    fs.chmodSync(shared, 0o777);
    fs.mkdirSync(privateBarrier, { mode: 0o700 });
    assert.throws(() => installRelease({ ...item, prefix: unsafePrefix }), /writable path ancestor/);
    assert.equal(fs.existsSync(unsafePrefix), false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("rejects a mixed source snapshot before creating the prefix", () => {
  const item = fixture();
  try {
    const sourceFile = path.join(item.sourceRoot, "app/runtime.txt");
    let reads = 0;
    const runtime = { ...fs, readFileSync: (descriptor, ...args) => {
      const bytes = fs.readFileSync(descriptor, ...args);
      reads += 1;
      if (reads === 1) fs.writeFileSync(sourceFile, "two\n");
      return bytes;
    } };
    assert.throws(() => installRelease({ ...item, runtime }), /two-pass snapshot/);
    assert.equal(fs.existsSync(item.prefix), false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("cleans activation temporaries and an unused first-install layout", () => {
  const item = fixture();
  try {
    let links = 0;
    const runtime = { ...fs, symlinkSync: (...args) => {
      links += 1;
      if (links === 2) throw Object.assign(new Error("simulated symlink failure"), { code: "EIO" });
      return fs.symlinkSync(...args);
    } };
    assert.throws(() => installRelease({ ...item, runtime }), /simulated symlink/);
    const layout = installationLayout(item.prefix);
    assert.equal(fs.existsSync(layout.managedRoot), false);
    assert.equal(fs.existsSync(layout.launcher), false);
    assert.equal(fs.existsSync(layout.managerLauncher), false);
    assert.equal(fs.existsSync(layout.lock), false);
    assert.equal(fs.readdirSync(layout.bin).some((name) => name.includes("activate")), false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("restores the prior activation when a later link switch fails", () => {
  const item = fixture();
  try {
    const first = installRelease(item);
    fs.writeFileSync(path.join(item.sourceRoot, "app/runtime.txt"), "changed\n");
    let activationRenames = 0;
    let failed = false;
    const runtime = { ...fs, renameSync: (source, target) => {
      if (path.basename(source).startsWith(".activate-")) activationRenames += 1;
      if (!failed && activationRenames === 3) {
        failed = true;
        throw Object.assign(new Error("simulated activation failure"), { code: "EIO" });
      }
      return fs.renameSync(source, target);
    } };
    assert.throws(() => installRelease({ ...item, runtime, version: PATCH_UPGRADE }), /simulated/);
    assert.equal(fs.readlinkSync(path.join(item.prefix, "lib/tm-u220/current")),
      `releases/${first.manifest.releaseId}`);
    assert.equal(inspectInstallation(item.prefix).healthy, true);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("the complete installed 220 wrapper resolves its own release", { timeout: 30000 }, () => {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "tm-u220-distribution-test-"));
  const prefix = path.join(base, "prefix");
  const root = fileURLToPath(new URL("../../", import.meta.url));
  try {
    const result = installRelease({ prefix, sourceRoot: root, payload: DISTRIBUTION_PAYLOAD });
    const help = spawnSync(result.launcher, ["--help"], { encoding: "utf8", timeout: 10000 });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /format text and print it reliably/);
    const render = spawnSync(result.launcher, ["render", "--text", "hello"],
      { encoding: "utf8", timeout: 10000 });
    assert.equal(render.status, 0, render.stderr);
    assert.match(render.stdout, /hello/);
    const previewHelp = spawnSync(result.launcher, ["preview", "--help"],
      { encoding: "utf8", timeout: 10000 });
    assert.equal(previewHelp.status, 0, previewHelp.stderr);
    assert.match(previewHelp.stdout, /Usage:\s+220 preview <file>/);
    const directives = spawnSync(result.launcher, ["directives"],
      { encoding: "utf8", timeout: 10000 });
    assert.equal(directives.status, 0, directives.stderr);
    assert.match(directives.stdout, /Valid job directives/);
    const configHelp = spawnSync(result.launcher, ["config", "--help"],
      { encoding: "utf8", timeout: 10000 });
    assert.equal(configHelp.status, 0, configHelp.stderr);
    assert.match(configHelp.stdout, /Usage:\s+220 config/);

    const configRoot = path.join(base, "authoring-config");
    assert.equal(runConfiguration({
      root: result.releaseRoot,
      environment: { TM_U220_CONFIG_HOME: configRoot },
      platform: "darwin",
      uid: process.getuid(),
      stdinIsTTY: true,
      stdoutIsTTY: true,
      spawn: () => ({ status: 0, signal: null }),
    }), 0);
    assert.equal(fs.existsSync(path.join(
      configRoot, "directives/aliases.u220a")), true);
    assert.equal(fs.existsSync(path.join(
      configRoot, "printers/local.u220p")), true);
    assert.equal(fs.existsSync(path.join(
      configRoot, "images/default.u220i")), true);
    assert.equal(inspectInstallation(prefix).healthy, true);
    const version = spawnSync(result.managerLauncher, ["version"],
      { encoding: "utf8", timeout: 10000 });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), APPLICATION_VERSION);
    const inspection = spawnSync(result.managerLauncher,
      ["inspect", "--json"], { encoding: "utf8", timeout: 10000 });
    assert.equal(inspection.status, 0, inspection.stderr);
    assert.equal(JSON.parse(inspection.stdout).healthy, true);
    const manifest = spawnSync(result.managerLauncher, ["manifest", "--json"],
      { encoding: "utf8", timeout: 10000 });
    assert.equal(manifest.status, 0, manifest.stderr);
    assert.equal(JSON.parse(manifest.stdout).contentHash, result.manifest.contentHash);
    const dryRun = spawnSync(result.managerLauncher,
      ["uninstall", "--json"], { encoding: "utf8", timeout: 10000 });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(JSON.parse(dryRun.stdout).removed, false);
    const removal = spawnSync(result.managerLauncher,
      ["uninstall", "--remove", "--keep-printing-policy", "--json"],
      { encoding: "utf8", timeout: 10000 });
    assert.equal(removal.status, 0, removal.stderr);
    assert.equal(JSON.parse(removal.stdout).removed, true);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
