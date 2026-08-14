// Locks the browser editor to its configured image and profile service boundary.
// Client bodies cannot select paths, invoke printing, or save across another origin.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createImageProfileRouter } from "../../libexec/image_profile_editor/router.mjs";

const origin = "http://127.0.0.1:54120";
const root = fileURLToPath(new URL("../../", import.meta.url));

async function request(router, method, url, body, requestOrigin = origin) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const input = Readable.from(chunks);
  Object.assign(input, { method, url, headers: {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(requestOrigin ? { origin: requestOrigin } : {}),
  } });
  const output = { status: 0, headers: {}, chunks: [],
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(value = "") { this.chunks.push(Buffer.from(value)); } };
  await router(input, output);
  const text = Buffer.concat(output.chunks).toString("utf8");
  return { status: output.status, headers: output.headers,
    body: text ? JSON.parse(text) : null };
}

function fixture() {
  const calls = { compile: [], save: [] };
  const store = {
    async read() { return { profile_name: "default.u220i", source: "draft",
      revision: "r1", image_profile: { density: "solid" }, schema: { fields: [] } }; },
    async save(body) { calls.save.push(body); return { saved: true, ...body }; },
  };
  const compile = async (source, options) => {
    calls.compile.push({ source, options });
    return { valid: true, lines: [], byte_count: 0 };
  };
  const config = { root: "/release", target: "/fixed/source.jpg",
    profile: "/fixed/printer.u220p" };
  return { calls, router: createImageProfileRouter({
    config, store, compile, origin: () => origin,
    editorRoot: "/unavailable/editor", webRoot: "/unavailable/web",
  }) };
}

test("session and preview use only fixed server paths", async () => {
  const { calls, router } = fixture();
  const session = await request(router, "GET", "/api/session");
  assert.equal(session.status, 200);
  assert.equal(session.body.image_name, "source.jpg");

  const preview = await request(router, "POST", "/api/preview", { source: "profile" });
  assert.equal(preview.status, 200);
  assert.equal(calls.compile.length, 1);
  assert.equal(calls.compile[0].source, "profile");
  assert.equal(calls.compile[0].options.root, "/release");
  assert.equal(calls.compile[0].options.image, "/fixed/source.jpg");
  assert.equal(calls.compile[0].options.profile, "/fixed/printer.u220p");
  assert.equal(calls.compile[0].options.signal instanceof AbortSignal, true);
  const override = await request(router, "POST", "/api/preview", {
    source: "profile", image: "/other.jpg",
  });
  assert.equal(override.status, 400);
  assert.equal(calls.compile.length, 1);
});

test("save requires same origin and exact source/revision fields", async () => {
  const { calls, router } = fixture();
  const denied = await request(router, "PUT", "/api/profile",
    { source: "profile", revision: "r1" }, "http://attacker.invalid");
  assert.equal(denied.status, 403);
  assert.equal(calls.save.length, 0);
  const extra = await request(router, "PUT", "/api/profile",
    { source: "profile", revision: "r1", path: "/tmp/other" });
  assert.equal(extra.status, 400);
  const saved = await request(router, "PUT", "/api/profile",
    { source: "profile", revision: "r1" });
  assert.equal(saved.status, 200);
  assert.deepEqual(calls.save, [{ source: "profile", revision: "r1" }]);
});

test("editor has no print or transport endpoint", async () => {
  const { router } = fixture();
  for (const endpoint of ["/api/print", "/api/submit", "/api/file"]) {
    const result = await request(router, "POST", endpoint, {});
    assert.equal(result.status, 404);
  }
});

test("a disconnected preview aborts its server-side compiler", async () => {
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let receivedSignal;
  const previewQueue = { run(source, options, signal) {
    receivedSignal = signal;
    started();
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(
      Object.assign(new Error("cancelled"), { name: "AbortError", status: 409 })),
    { once: true }));
  } };
  const router = createImageProfileRouter({
    config: { root: "/release", target: "/fixed/source.jpg",
      profile: "/fixed/printer.u220p" },
    store: { async read() { return {}; } }, previewQueue, origin: () => origin,
    editorRoot: "/unavailable/editor", webRoot: "/unavailable/web",
  });
  const input = Readable.from([Buffer.from(JSON.stringify({ source: "profile" }))]);
  Object.assign(input, { method: "POST", url: "/api/preview", headers: {
    "content-type": "application/json", origin,
  } });
  const output = { status: 0, chunks: [],
    writeHead(status) { this.status = status; },
    end(value = "") { this.chunks.push(Buffer.from(value)); } };
  const routed = router(input, output);
  await ready;
  input.emit("aborted");
  await routed;
  assert.equal(receivedSignal.aborted, true);
  assert.equal(output.status, 409);
});

test("preview route returns the canonical unsaved printer mask", async () => {
  const source = fs.readFileSync(path.join(root, "config/images/default.u220i"), "utf8");
  const router = createImageProfileRouter({
    config: {
      root, target: path.join(root, "test/assets/Chicken.png"),
      profile: path.join(root, "config/printers/local.u220p"),
    },
    store: { async read() { return {}; } }, origin: () => origin,
    editorRoot: "/unavailable/editor", webRoot: "/unavailable/web",
  });
  const result = await request(router, "POST", "/api/preview", { source });
  assert.equal(result.status, 200);
  assert.equal(result.body.valid, true);
  const segment = result.body.lines[0].segments[0];
  assert.equal(segment.mask_width_dots, 400);
  assert.equal(segment.mask_height_dots, 126);
  assert.equal(crypto.createHash("sha256").update(
    Buffer.from(segment.mask_data, "hex")).digest("hex"),
  "37e8495bb8c97fce66fd3a2b48d7c4c4c004c89c9f727e3ebc3619476fc718d1");
});
