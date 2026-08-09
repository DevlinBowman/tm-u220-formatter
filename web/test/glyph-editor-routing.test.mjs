// Verifies one development router exposes reciprocal glyph/receipt navigation and separate APIs.
// Response fakes exercise route composition without binding a network port or writing sources.
import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createDevelopmentRouter } from "../../dev/glyph_editor/server/router.mjs";

const projectRoot = resolve(import.meta.dirname, "../..");
const origin = () => "http://127.0.0.1:8123";

function request(url) {
  return { method: "GET", url, headers: {} };
}

async function invoke(router, url) {
  const result = { status: 0, headers: {}, body: "" };
  const response = {
    writeHead(status, headers) {
      result.status = status;
      result.headers = headers;
    },
    end(body = "") { result.body = Buffer.from(body).toString("utf8"); },
  };
  await router(request(url), response);
  return result;
}

function router() {
  return createDevelopmentRouter({
    glyphStore: { read: async () => ({ fonts: { a: {}, b: {} } }) },
    appearanceStore: { read: async () => ({ single: 0.28, double: 0.3 }) },
    publicRoot: resolve(projectRoot, "dev/glyph_editor/public"),
    webRoot: resolve(projectRoot, "web"),
    webStyles: resolve(projectRoot, "web/styles"),
    origin,
    previewConfig: { root: projectRoot, plain: false,
      profile: resolve(projectRoot, "config/printers/local.u220p") },
    previewDocument: { read: async () => ({
      source: "TEST", name: "test.u220", plain: false,
    }) },
  });
}

test("root and shorthand paths select canonical development views", async () => {
  const handle = router();
  assert.equal((await invoke(handle, "/")).headers.Location, "/glyphs/");
  assert.equal((await invoke(handle, "/glyphs")).headers.Location, "/glyphs/");
  assert.equal((await invoke(handle, "/preview")).headers.Location, "/preview/");
});

test("glyph and receipt pages link to each other on one origin", async () => {
  const handle = router();
  const glyphs = await invoke(handle, "/glyphs/");
  const preview = await invoke(handle, "/preview/");
  assert.equal(glyphs.status, 200);
  assert.match(glyphs.body, /href="\/preview\/"/);
  assert.match(glyphs.body,
    /aria-describedby="matrix-help authoring-baseline-guide alignment-guide"/);
  assert.match(glyphs.body, /Matrix and printer spacing/);
  assert.match(glyphs.body, /data-study-spacing="2"/);
  assert.match(glyphs.body, /every row and column remains usable glyph data/i);
  assert.match(glyphs.body, /Comparison text/);
  assert.equal(preview.status, 200);
  assert.match(preview.body, /href="\/glyphs\/">Glyph editor/);
  assert.match(preview.body, /src="\.\/app\.js"/);
  assert.equal((await invoke(handle, "/glyphs/geometry.css")).status, 200);
  assert.equal((await invoke(handle, "/glyphs/font-guides.js")).status, 200);
  assert.equal((await invoke(handle, "/glyphs/study-text.js")).status, 200);
});

test("glyph settings and receipt session retain separate endpoints", async () => {
  const handle = router();
  const glyphs = await invoke(handle, "/api/glyphs");
  const appearance = await invoke(handle, "/api/appearance");
  const session = await invoke(handle, "/api/session");
  assert.deepEqual(JSON.parse(glyphs.body), { fonts: { a: {}, b: {} } });
  assert.deepEqual(JSON.parse(appearance.body), { single: 0.28, double: 0.3 });
  assert.deepEqual(JSON.parse(session.body), {
    source: "TEST", name: "test.u220", plain: false,
  });
});

test("development routes do not expose either server implementation", async () => {
  const handle = router();
  assert.equal((await invoke(handle, "/glyphs/server/main.mjs")).status, 404);
  assert.equal((await invoke(handle, "/preview/server/main.mjs")).status, 404);
});
