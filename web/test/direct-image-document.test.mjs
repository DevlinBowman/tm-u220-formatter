// Verifies browser sessions classify image signatures before any UTF-8 document handling.
// Session classification stays independent from the separately tested canonical JPEG decoder.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { parseConfig } from "../server/config.mjs";
import { EditorDocument } from "../server/document.mjs";
import { createRouter } from "../server/router.mjs";

const root = resolve(import.meta.dirname, "../..");
const profile = resolve(root, "config/printers/local.u220p");
const imageProfile = resolve(root, "config/images/default.u220i");
const validJpeg = resolve(root, "test/assets/jpeg/color-grid-7x5.jpg");
const JPEG_SIGNATURE_FIXTURE = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x00, 0x80, 0xff, 0xd9,
]);

async function jpegFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "u220-jpeg-session-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "fixture.jpg");
  await writeFile(path, JPEG_SIGNATURE_FIXTURE);
  return path;
}

function request(method, path, body, origin) {
  const source = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return Object.assign(Readable.from(source), {
    method,
    url: path,
    headers: body === undefined
      ? {}
      : { "content-type": "application/json", origin },
  });
}

async function routeJson(router, method, path, body, origin) {
  const response = {
    status: 0,
    chunks: [],
    writeHead(status) { this.status = status; },
    end(value = "") { this.chunks.push(Buffer.from(value)); },
  };
  await router(request(method, path, body, origin), response);
  return {
    status: response.status,
    body: JSON.parse(Buffer.concat(response.chunks).toString("utf8")),
  };
}

test("JPEG magic opens as an immutable direct-image document", async (t) => {
  const path = await jpegFixture(t);
  await chmod(path, 0o444);
  const config = await parseConfig([
    path, "--no-open", "--profile", profile, "--image-profile", imageProfile,
  ], root);
  const document = await EditorDocument.open(config.target, true);
  const session = await document.read();

  assert.equal(document.immutable, true);
  assert.equal(document.plain, false);
  assert.equal(session.source, "");
  assert.match(session.display_source, /fixture\.jpg/);
  assert.equal(session.input_kind, "image");
});

test("JPEG browser routes expose no bytes and reject replacement source", async (t) => {
  const path = await jpegFixture(t);
  const before = await readFile(path);
  const document = await EditorDocument.open(path, false);
  const origin = "http://127.0.0.1:52117";
  const router = createRouter({
    config: { root, target: path, profile, imageProfile, plain: false },
    document,
    webRoot: resolve(root, "web"),
    origin: () => origin,
  });

  const session = await routeJson(router, "GET", "/api/session", undefined, origin);
  assert.equal(session.status, 200);
  assert.equal(session.body.source, "");
  assert.equal(session.body.immutable, true);

  const replacement = await routeJson(router, "PUT", "/api/file", {
    source: "not JPEG bytes",
  }, origin);
  assert.equal(replacement.status, 405);
  assert.match(replacement.body.error, /read-only/);
  assert.deepEqual(await readFile(path), before);
});

test("valid JPEG preview routes compile the fixed canonical printer mask", async () => {
  const document = await EditorDocument.open(validJpeg, false);
  const origin = "http://127.0.0.1:52117";
  const router = createRouter({
    config: { root, target: validJpeg, profile, imageProfile, plain: false },
    document,
    webRoot: resolve(root, "web"),
    origin: () => origin,
  });

  const preview = await routeJson(router, "POST", "/api/preview", {
    source: "THIS POSTED SOURCE MUST NOT PRINT",
    path: "../another-image.jpg",
    plain: true,
  }, origin);
  const segment = preview.body.lines[0].segments[0];

  assert.equal(preview.status, 200);
  assert.equal(preview.body.valid, true);
  assert.equal(preview.body.input_kind, "image");
  assert.equal(preview.body.lines[0].image_label, "color-grid-7x5.jpg");
  assert.deepEqual([segment.mask_width_dots, segment.mask_height_dots], [200, 129]);
  assert.equal(createHash("sha256")
    .update(Buffer.from(segment.mask_data, "hex")).digest("hex"),
    "137e6175ceec51227b193db50c5b7f259899b2d15ae9686844e444a90b8fe045");
});
