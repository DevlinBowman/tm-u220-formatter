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
    "printf '%s %s\\n' \"$TM_U220_STDIN_IS_TTY\" \"$TM_U220_STDOUT_IS_TTY\"",
    "",
  ].join("\n"));
  chmodSync(fakeLua, 0o755);
});

after(() => {
  rmSync(fakeBin, { recursive: true, force: true });
});

test("launcher exports measured non-TTY stream markers", () => {
  const result = spawnSync(launcher, [], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
      TM_U220_STDIN_IS_TTY: "1",
      TM_U220_STDOUT_IS_TTY: "1",
    },
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "0 0\n");
});
