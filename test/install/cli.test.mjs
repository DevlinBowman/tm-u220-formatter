// Verifies the public distribution-manager help, safety, and exit-status contracts.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main, runCli } from "../../install/cli.mjs";
import { usage } from "../../install/arguments.mjs";

const launcher = fileURLToPath(new URL("../../install/tm-u220", import.meta.url));

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

test("bare invocation and help verb print canonical non-mutating help", async () => {
  for (const argv of [[], ["help"]]) {
    const output = capture();
    const code = await runCli(argv, output.io, {
      sourceRoot: "/path-that-must-not-be-read-without-an-explicit-command",
      homedir: () => { throw new Error("must not resolve a prefix"); },
    });

    assert.equal(code, 0);
    assert.equal(output.stdout(), `${usage()}\n`);
    assert.equal(output.stderr(), "");
    assert.match(output.stdout(), /tm-u220-install help/);
    assert.match(output.stdout(), /bare invocation shows this help and changes nothing/);
    assert.doesNotMatch(output.stdout(), /install\/tm-u220 install/);
  }
});

test("public entry maps usage failures to exit 2 with canonical guidance", async () => {
  const output = capture();
  const code = await main(["version", "--json"], output.io, {
    homedir: () => "/Users/example",
  });

  assert.equal(code, 2);
  assert.equal(output.stdout(), "");
  assert.match(output.stderr(), /^tm-u220-install: --json is not accepted with version/);
  assert.match(output.stderr(), /run 'tm-u220-install help' for usage/);
});

test("public launcher exits 2 for usage failures", () => {
  const result = spawnSync(launcher, ["version", "--json"], {
    encoding: "utf8", timeout: 10000,
  });

  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^tm-u220-install: --json is not accepted with version/);
});

test("public entry keeps operational failures distinct from usage failures", async () => {
  const output = capture();
  const code = await main(["manifest"], output.io, {
    sourceRoot: "/path-that-does-not-contain-a-release",
    homedir: () => "/Users/example",
  });

  assert.equal(code, 1);
  assert.equal(output.stdout(), "");
  assert.match(output.stderr(), /^tm-u220-install: /);
  assert.doesNotMatch(output.stderr(), /for usage/);
});
