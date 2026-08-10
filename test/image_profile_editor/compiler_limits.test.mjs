// Exercises worker deadlines, cancellation, and bounded error output with isolated Lua fixtures.
// Termination must settle promptly so a failed draft cannot hold the live-preview queue open.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectProfile } from "../../libexec/image_profile_editor/compiler.mjs";

function workerFixture(source) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u220-worker-limit-"));
  const directory = path.join(root, "libexec/image_profile_editor");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "worker.lua"), source, "utf8");
  return root;
}

test("worker deadline terminates an unresponsive process group", async (t) => {
  const root = workerFixture("while true do end\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const started = Date.now();
  await assert.rejects(() => inspectProfile("draft", { root, timeoutMs: 40 }),
    /worker timed out/);
  assert.ok(Date.now() - started < 2000);
});

test("abort signals terminate a worker before its deadline", async (t) => {
  const root = workerFixture("while true do end\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const controller = new AbortController();
  const result = inspectProfile("draft", {
    root, timeoutMs: 5000, signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(() => result, { name: "AbortError" });
});

test("worker stderr is bounded independently from preview output", async (t) => {
  const root = workerFixture('io.stderr:write(string.rep("x", 70000))\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await assert.rejects(() => inspectProfile("draft", { root }),
    /error output is too large/);
});
