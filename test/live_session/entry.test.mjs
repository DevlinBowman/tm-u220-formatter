import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL(
  "../../libexec/tm-u220-live-session.mjs",
  import.meta.url,
));

test("entry reports rejected plans with the standard failure schema", () => {
  const directory = mkdtempSync(join(tmpdir(), "tm-u220-live-entry-"));
  const planPath = join(directory, "plan.json");
  const resultPath = join(directory, "result.tsv");
  try {
    writeFileSync(planPath, "{}\n", { mode: 0o600 });
    const child = spawnSync(process.execPath, [helper, planPath, resultPath], {
      encoding: "utf8",
    });
    assert.equal(child.status, 2);
    const fields = readFileSync(resultPath, "utf8").trimEnd().split("\t")
      .map((value) => decodeURIComponent(value));
    assert.equal(fields.length, 11);
    assert.equal(fields[0], "error");
    assert.equal(fields[1], "LIVE_PLAN_REJECTED");
    assert.equal(fields[9].length > 0, true);
    assert.equal(fields[10], "0");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
