// Exercises safe configuration seeding against real temporary filesystem objects.
// Existing user data must survive while links and unsafe ownership modes fail closed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configurationFiles } from "../../libexec/configuration/paths.mjs";
import { prepareConfiguration } from "../../libexec/configuration/store.mjs";

const uid = process.getuid();

function fixture(userOwned = true) {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),
    "tm-u220-config-store-"));
  const root = path.join(base, "release");
  const userRoot = path.join(base, "user-config");
  const aliasTemplate = "@bold => @text bold\n";
  const profileTemplate = "columns = 80\n";
  fs.mkdirSync(path.join(root, "config/directives"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(root, "config/printers"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(root, "config/directives/aliases.u220a"), aliasTemplate);
  fs.writeFileSync(path.join(root, "config/printers/local.u220p"), profileTemplate);
  const files = configurationFiles(root, { TM_U220_CONFIG_HOME: userRoot }, userOwned);
  return { base, files, userRoot, aliasTemplate, profileTemplate };
}

function removeFixture(item) {
  fs.rmSync(item.base, { recursive: true, force: true });
}

test("seeds missing user files byte-for-byte with private permissions", () => {
  const item = fixture();
  try {
    const prepared = prepareConfiguration(item.files, { uid });
    assert.equal(Object.isFrozen(prepared), true);
    assert.deepEqual(prepared, item.files.map((file) => file.path));
    assert.equal(fs.readFileSync(item.files[0].path, "utf8"), item.aliasTemplate);
    assert.equal(fs.readFileSync(item.files[1].path, "utf8"), item.profileTemplate);
    for (const file of item.files) {
      assert.equal(fs.lstatSync(file.path).mode & 0o077, 0);
      assert.equal(fs.lstatSync(file.path).nlink, 1);
    }
    assert.equal(fs.lstatSync(item.userRoot).mode & 0o077, 0);
  } finally { removeFixture(item); }
});

test("never overwrites existing user configuration", () => {
  const item = fixture();
  try {
    prepareConfiguration(item.files, { uid });
    fs.writeFileSync(item.files[0].path, "@mine => @text underline\n");
    prepareConfiguration(item.files, { uid });
    assert.equal(fs.readFileSync(item.files[0].path, "utf8"),
      "@mine => @text underline\n");
  } finally { removeFixture(item); }
});

test("validates checkout files in place without creating a user tree", () => {
  const item = fixture(false);
  try {
    const prepared = prepareConfiguration(item.files, { uid });
    assert.deepEqual(prepared, item.files.map((file) => file.factoryPath));
    assert.equal(fs.existsSync(item.userRoot), false);
  } finally { removeFixture(item); }
});

test("rejects symbolic links for the configuration root or an editable file", () => {
  const linkedRoot = fixture();
  try {
    const outside = path.join(linkedRoot.base, "outside");
    fs.mkdirSync(outside, { mode: 0o700 });
    fs.symlinkSync(outside, linkedRoot.userRoot);
    assert.throws(() => prepareConfiguration(linkedRoot.files, { uid }),
      /configuration directory must not be a symlink/);
  } finally { removeFixture(linkedRoot); }

  const linkedFile = fixture();
  try {
    prepareConfiguration(linkedFile.files, { uid });
    fs.unlinkSync(linkedFile.files[0].path);
    fs.symlinkSync(linkedFile.files[0].factoryPath, linkedFile.files[0].path);
    assert.throws(() => prepareConfiguration(linkedFile.files, { uid }),
      /regular file and not a symbolic link/);
  } finally { removeFixture(linkedFile); }
});

test("rejects multiply-linked or group-writable editable files", () => {
  const linked = fixture();
  try {
    prepareConfiguration(linked.files, { uid });
    const secondLink = path.join(linked.base, "aliases-link");
    fs.linkSync(linked.files[0].path, secondLink);
    assert.throws(() => prepareConfiguration(linked.files, { uid }),
      /exactly one filesystem link/);
  } finally { removeFixture(linked); }

  const writable = fixture();
  try {
    prepareConfiguration(writable.files, { uid });
    fs.chmodSync(writable.files[0].path, 0o620);
    assert.throws(() => prepareConfiguration(writable.files, { uid }),
      /group- or world-writable/);
  } finally { removeFixture(writable); }
});

test("rejects root execution and mixed ownership modes", () => {
  const item = fixture();
  try {
    assert.throws(() => prepareConfiguration(item.files, { uid: 0 }), /not root or sudo/);
    assert.throws(() => prepareConfiguration([
      item.files[0],
      { ...item.files[1], userOwned: false },
    ], { uid }), /ownership modes are mixed/);
  } finally { removeFixture(item); }
});
