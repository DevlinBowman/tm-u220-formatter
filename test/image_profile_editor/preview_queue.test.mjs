// Verifies live preview work remains single-flight and newer drafts replace stale queued work.
// Abort signals reach the active compiler before the most recent pending draft can begin.
import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewQueue } from "../../libexec/image_profile_editor/preview_queue.mjs";

function turn() { return new Promise((resolve) => setImmediate(resolve)); }

test("superseded previews terminate active work and coalesce pending drafts", async () => {
  const calls = [];
  let active = 0;
  let maximum = 0;
  let finalResolve;
  const queue = createPreviewQueue((source, options) => new Promise((resolve, reject) => {
    calls.push(source);
    active += 1;
    maximum = Math.max(maximum, active);
    if (source === "three") finalResolve = () => { active -= 1; resolve(source); };
    options.signal.addEventListener("abort", () => setImmediate(() => {
      active -= 1;
      reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    }), { once: true });
  }));

  const first = queue.run("one", {}).catch((error) => error);
  await turn();
  const second = queue.run("two", {}).catch((error) => error);
  const third = queue.run("three", {});
  assert.equal((await second).name, "AbortError");
  assert.equal((await first).name, "AbortError");
  await turn();
  assert.deepEqual(calls, ["one", "three"]);
  assert.equal(maximum, 1);
  finalResolve();
  assert.equal(await third, "three");
});

test("a disconnected pending request never reaches the compiler", async () => {
  let release;
  const calls = [];
  const queue = createPreviewQueue((source, options) => new Promise((resolve, reject) => {
    calls.push(source);
    if (source === "active") {
      release = resolve;
      options.signal.addEventListener("abort", () => reject(
        Object.assign(new Error("cancelled"), { name: "AbortError" })), { once: true });
    }
  }));
  const active = queue.run("active", {});
  await turn();
  const controller = new AbortController();
  const pending = queue.run("pending", {}, controller.signal).catch((error) => error);
  controller.abort();
  assert.equal((await pending).name, "AbortError");
  await assert.rejects(active, { name: "AbortError" });
  assert.deepEqual(calls, ["active"]);
  release?.();
});
