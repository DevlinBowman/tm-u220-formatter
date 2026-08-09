// Verifies the canonical factory and per-user configuration locations.
// Environment overrides must remain absolute and deterministic.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  CONFIGURATION_FILES,
  configurationFiles,
  configurationRoot,
} from "../../libexec/configuration/paths.mjs";

test("selects explicit, XDG, and HOME configuration roots in order", () => {
  assert.equal(configurationRoot({
    TM_U220_CONFIG_HOME: "/private/tmp/explicit/../u220",
    XDG_CONFIG_HOME: "/private/tmp/xdg",
    HOME: "/Users/example",
  }), path.normalize("/private/tmp/u220"));
  assert.equal(configurationRoot({
    XDG_CONFIG_HOME: "/private/tmp/xdg",
    HOME: "/Users/example",
  }), "/private/tmp/xdg/tm-u220");
  assert.equal(configurationRoot({ HOME: "/Users/example" }),
    "/Users/example/.config/tm-u220");
});

test("rejects relative environment locations and a missing home", () => {
  assert.throws(() => configurationRoot({ TM_U220_CONFIG_HOME: "relative" }),
    /TM_U220_CONFIG_HOME must be an absolute path/);
  assert.throws(() => configurationRoot({ XDG_CONFIG_HOME: "relative" }),
    /XDG_CONFIG_HOME must be an absolute path/);
  assert.throws(() => configurationRoot({ HOME: "relative" }),
    /HOME must be an absolute path/);
  assert.throws(() => configurationRoot({}), /HOME is required/);
});

test("maps a managed release to user files without changing factory paths", () => {
  const root = "/Applications/TM-U220/current";
  const files = configurationFiles(root,
    { TM_U220_CONFIG_HOME: "/Users/example/.config/tm-u220-test" }, true);
  assert.deepEqual(files.map(({ name, factoryPath, path: editablePath, userOwned }) => ({
    name, factoryPath, editablePath, userOwned,
  })), [
    {
      name: "aliases",
      factoryPath: `${root}/config/directives/aliases.u220a`,
      editablePath: "/Users/example/.config/tm-u220-test/directives/aliases.u220a",
      userOwned: true,
    },
    {
      name: "profile",
      factoryPath: `${root}/config/printers/local.u220p`,
      editablePath: "/Users/example/.config/tm-u220-test/printers/local.u220p",
      userOwned: true,
    },
  ]);
});

test("maps a checkout directly to its checked-in configuration", () => {
  const root = "/Users/example/src/tm-u220";
  const files = configurationFiles(root, {}, false);
  assert.deepEqual(files.map((file) => file.path),
    CONFIGURATION_FILES.map((file) => path.join(root, file.factoryRelative)));
  assert.equal(files.every((file) => file.userOwned === false), true);
  assert.throws(() => configurationFiles("relative", {}, false),
    /release root must be absolute/);
});
