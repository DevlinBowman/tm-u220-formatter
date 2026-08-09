// Verifies the configuration workflow boundary from invocation checks through editor launch.
// Checkout files stay in place while managed releases seed private per-user copies.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runConfiguration } from "../../libexec/configuration/cli.mjs";
import { VIM_PATH } from "../../libexec/configuration/editor.mjs";

const uid = process.getuid();

function fixture(managed = false) {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "tm-u220-config-cli-"));
  const root = path.join(base, "release");
  const userRoot = path.join(base, "user-config");
  fs.mkdirSync(path.join(root, "config/directives"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(root, "config/printers"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(root, "config/images"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(root, "config/directives/aliases.u220a"), "@b => @text bold\n");
  fs.writeFileSync(path.join(root, "config/printers/local.u220p"), "columns = 80\n");
  fs.writeFileSync(path.join(root, "config/images/default.u220i"), "density = solid\n");
  if (managed) fs.writeFileSync(path.join(root, ".tm-u220-install.json"), "{}\n");
  else fs.mkdirSync(path.join(root, ".git"));
  return { base, root, userRoot };
}

function options(item, spawn) {
  return {
    root: item.root,
    environment: { TM_U220_CONFIG_HOME: item.userRoot },
    platform: "darwin",
    uid,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    spawn,
  };
}

test("rejects root and non-interactive use before filesystem or process work", () => {
  let touched = false;
  const runtime = { lstatSync() { touched = true; throw new Error("unexpected filesystem use"); } };
  const spawn = () => { touched = true; throw new Error("unexpected process use"); };
  const base = {
    root: "/private/tmp/tm-u220-release",
    environment: { HOME: "/Users/example" },
    platform: "darwin",
    runtime,
    spawn,
    stdoutIsTTY: true,
  };
  assert.throws(() => runConfiguration({ ...base, uid: 0, stdinIsTTY: true }),
    /not root or sudo/);
  assert.equal(touched, false);
  assert.throws(() => runConfiguration({ ...base, uid: 501, stdinIsTTY: false }),
    /requires an interactive terminal/);
  assert.equal(touched, false);
});

test("opens checked-in configuration directly for a source checkout", () => {
  const item = fixture(false);
  let invocation;
  try {
    const status = runConfiguration(options(item, (executable, args, spawnOptions) => {
      invocation = { executable, args, spawnOptions };
      return { status: 0, signal: null };
    }));
    assert.equal(status, 0);
    assert.equal(invocation.executable, VIM_PATH);
    assert.deepEqual(invocation.args, [
      "-p", "--",
      path.join(item.root, "config/directives/aliases.u220a"),
      path.join(item.root, "config/printers/local.u220p"),
      path.join(item.root, "config/images/default.u220i"),
    ]);
    assert.equal(invocation.spawnOptions.shell, false);
    assert.equal(fs.existsSync(item.userRoot), false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("recognizes a Git worktree checkout marker", () => {
  const item = fixture(false);
  let invocation;
  try {
    fs.rmdirSync(path.join(item.root, ".git"));
    fs.writeFileSync(path.join(item.root, ".git"), "gitdir: /private/tmp/common.git\n");
    const status = runConfiguration(options(item, (executable, args) => {
      invocation = { executable, args };
      return { status: 0, signal: null };
    }));
    assert.equal(status, 0);
    assert.equal(invocation.executable, VIM_PATH);
    assert.equal(fs.existsSync(item.userRoot), false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("seeds and opens user copies for a managed release", () => {
  const item = fixture(true);
  let invocation;
  const aliasTemplate = fs.readFileSync(
    path.join(item.root, "config/directives/aliases.u220a"), "utf8");
  try {
    const status = runConfiguration(options(item, (executable, args) => {
      invocation = { executable, args };
      return { status: 0, signal: null };
    }));
    const aliasPath = path.join(item.userRoot, "directives/aliases.u220a");
    const profilePath = path.join(item.userRoot, "printers/local.u220p");
    const imageProfilePath = path.join(item.userRoot, "images/default.u220i");
    assert.equal(status, 0);
    assert.deepEqual(invocation.args, ["-p", "--", aliasPath, profilePath, imageProfilePath]);
    assert.equal(fs.readFileSync(aliasPath, "utf8"), aliasTemplate);
    assert.equal(fs.readFileSync(profilePath, "utf8"), "columns = 80\n");
    assert.equal(fs.readFileSync(imageProfilePath, "utf8"), "density = solid\n");
    assert.equal(fs.readFileSync(
      path.join(item.root, "config/directives/aliases.u220a"), "utf8"), aliasTemplate);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("rejects a linked installed-release manifest before opening Vim", () => {
  const item = fixture(false);
  let spawned = false;
  try {
    const outside = path.join(item.base, "manifest.json");
    fs.writeFileSync(outside, "{}\n");
    fs.symlinkSync(outside, path.join(item.root, ".tm-u220-install.json"));
    assert.throws(() => runConfiguration(options(item, () => {
      spawned = true;
      return { status: 0 };
    })), /manifest must be a regular file/);
    assert.equal(spawned, false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});

test("refuses an unmarked tree instead of treating it as an editable checkout", () => {
  const item = fixture(false);
  let spawned = false;
  try {
    fs.rmdirSync(path.join(item.root, ".git"));
    assert.throws(() => runConfiguration(options(item, () => {
      spawned = true;
      return { status: 0 };
    })), /managed release or source checkout/);
    assert.equal(spawned, false);
    assert.equal(fs.existsSync(item.userRoot), false);
  } finally { fs.rmSync(item.base, { recursive: true, force: true }); }
});
