// Confirms the shipped shell launcher replaces ambient values with terminal facts measured at process startup.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const launcher = fileURLToPath(new URL("../../bin/tm-u220", import.meta.url));
let fakeBin;

before(() => {
  fakeBin = mkdtempSync(join(tmpdir(), "tm-u220-terminal-markers-"));
  const fakeLua = join(fakeBin, "lua");
  writeFileSync(fakeLua, [
    "#!/bin/sh",
    "printf '%s %s %s\\n' \"$TM_U220_STDIN_IS_TTY\" \"$TM_U220_STDIN_IS_STREAM\" \"$TM_U220_STDOUT_IS_TTY\"",
    "",
  ].join("\n"));
  chmodSync(fakeLua, 0o755);
});

after(() => {
  rmSync(fakeBin, { recursive: true, force: true });
});

test("launcher recognizes a producer-backed non-TTY stream", () => {
  const result = spawnSync(launcher, [], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
      TM_U220_STDIN_IS_TTY: "1",
      TM_U220_STDIN_IS_STREAM: "0",
      TM_U220_STDOUT_IS_TTY: "1",
    },
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "0 1 0\n");
});

test("launcher does not mistake /dev/null for piped input", () => {
  const result = spawnSync(launcher, [], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
      TM_U220_STDIN_IS_TTY: "1",
      TM_U220_STDIN_IS_STREAM: "1",
      TM_U220_STDOUT_IS_TTY: "1",
    },
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "0 0 0\n");
});

test("bare authoring input rejects /dev/null before reading", () => {
  const result = spawnSync(launcher, ["check"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /pipe or redirect standard input/);
});

test("piped authoring input remains available", () => {
  const result = spawnSync(launcher, ["check"], {
    encoding: "utf8",
    input: "hello from stdin\n",
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok: .+, 1 operations, \d+ bytes\n$/);
  assert.equal(result.stderr, "");
});
