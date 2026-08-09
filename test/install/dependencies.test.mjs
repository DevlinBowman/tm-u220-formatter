// Exercises dependency preflight without relying on or modifying the host's installed tools.
import test from "node:test";
import assert from "node:assert/strict";
import { checkDependencies, FIXED_TOOLS } from "../../install/dependencies.mjs";
import { REQUIRED_TOOLS } from "../../libexec/printing_setup/setup_environment.mjs";

function runtime(overrides = {}) {
  return {
    platform: "darwin", uid: 501, nodeVersion: "v20.11.0", path: "/tools",
    stat: (target) => {
      if (target === overrides.missing) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return { isFile: () => true };
    },
    access: () => {},
    spawn: (executable, args) => ({ status: 0,
      stdout: args[0] === "--version" ? "v20.11.0\n" : "Lua 5.4" }),
    ...overrides,
  };
}

test("accepts supported runtimes and the complete fixed tool set", () => {
  const found = checkDependencies(runtime());
  assert.equal(found.node, "/tools/node");
  assert.equal(found.lua, "/tools/lua");
  assert.ok(found.fixedTools.includes("/usr/sbin/visudo"));
});

test("rejects root, old runtimes, and missing fixed tools", () => {
  assert.throws(() => checkDependencies(runtime({ uid: 0 })), /normal user/);
  assert.throws(() => checkDependencies(runtime({ nodeVersion: "v18.20.0" })), /20\.11/);
  assert.throws(() => checkDependencies(runtime({ missing: "/usr/bin/nc" })), /\/usr\/bin\/nc/);
  assert.throws(() => checkDependencies(runtime({ platform: "linux" })), /only on macOS/);
});

test("checks the node selected by PATH independently", () => {
  const selected = runtime({ spawn: (executable, args) => ({ status: 0,
    stdout: args[0] === "--version" ? "v18.0.0\n" : "Lua 5.4" }) });
  assert.throws(() => checkDependencies(selected), /node executable on PATH/);
});

test("parses the Lua runtime version numerically", () => {
  const oldLua = runtime({ spawn: (executable, args) => ({ status: 0,
    stdout: args[0] === "--version" ? "v20.11.0\n" : "Lua 5.2" }) });
  assert.throws(() => checkDependencies(oldLua), /Lua 5\.3/);
  const futureLua = runtime({ spawn: (executable, args) => ({ status: 0,
    stdout: args[0] === "--version" ? "v20.11.0\n" : "Lua 6.0" }) });
  assert.doesNotThrow(() => checkDependencies(futureLua));
});

test("covers every fixed executable required by printing setup", () => {
  for (const target of REQUIRED_TOOLS) assert.ok(FIXED_TOOLS.includes(target), target);
});

test("covers fixed executables used by the shipped shell launchers", () => {
  assert.ok(FIXED_TOOLS.includes("/usr/bin/dirname"));
  assert.ok(FIXED_TOOLS.includes("/usr/bin/readlink"));
});

test("covers the fixed editor used by authoring configuration", () => {
  assert.ok(FIXED_TOOLS.includes("/usr/bin/vim"));
});
