// Verifies the pinned JPEG decoder produces bounded, deterministic grayscale and
// rejects unsafe frame envelopes before image-sized allocation can begin.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  decodeJpeg, JpegDecodeError,
} from "../../libexec/image_assets/jpeg/decode.mjs";
import { rgbToGrayscale } from "../../libexec/image_assets/jpeg/grayscale.mjs";
import { preflightJpeg } from "../../libexec/image_assets/jpeg/preflight.mjs";

const fixture = fileURLToPath(new URL("../assets/jpeg/color-grid-7x5.jpg", import.meta.url));
const ycckFixture = fileURLToPath(new URL(
  "../assets/jpeg/color-grid-ycck-7x5.jpg", import.meta.url,
));
const vendor = fileURLToPath(new URL(
  "../../libexec/image_assets/jpeg/vendor/jpeg-js-0.4.4/decoder.cjs",
  import.meta.url,
));

function segment(code, payload = Buffer.alloc(0)) {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, code]), length, payload]);
}

function adobe(transform) {
  return segment(0xee, Buffer.from([
    0x41, 0x64, 0x6f, 0x62, 0x65, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, transform,
  ]));
}

function frame(overrides = {}) {
  const components = overrides.components || [
    [1, 0x11, 0], [2, 0x11, 1], [3, 0x11, 1],
  ];
  const payload = Buffer.alloc(6 + components.length * 3);
  payload[0] = overrides.precision ?? 8;
  payload.writeUInt16BE(overrides.height ?? 5, 1);
  payload.writeUInt16BE(overrides.width ?? 7, 3);
  payload[5] = components.length;
  components.forEach((component, index) => {
    const at = 6 + index * 3;
    payload[at] = component[0];
    payload[at + 1] = component[1];
    payload[at + 2] = component[2];
  });
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...(overrides.before || []),
    segment(overrides.code ?? 0xc0, payload),
    ...(overrides.after || []),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function failure(bytes, code, limits) {
  assert.throws(() => preflightJpeg(bytes, limits), (error) => {
    assert.equal(error instanceof JpegDecodeError, true);
    assert.equal(error.code, code);
    return true;
  });
}

test("decodes a project-generated baseline JPEG to stable grayscale", () => {
  const bytes = fs.readFileSync(fixture);
  const decoded = decodeJpeg(bytes);
  assert.deepEqual([decoded.width, decoded.height, decoded.data.length], [7, 5, 35]);
  assert.equal(Buffer.isBuffer(decoded.data), true);
  assert.equal(Object.isFrozen(decoded), true);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),
    "e191cfd1093559ba2d636b1245395561a59babf85cdbbda49708799ad6b56ab8");
  assert.equal(crypto.createHash("sha256").update(decoded.data).digest("hex"),
    "090b9ee5e7a56ff54965a72b0d66157630d1fd30db41e5199b3f81d65fac2ad5");
  const inspected = preflightJpeg(new Uint8Array(bytes));
  assert.deepEqual({
    kind: inspected.frame.kind,
    width: inspected.frame.width,
    height: inspected.frame.height,
    components: inspected.frame.components,
  }, { kind: "baseline", width: 7, height: 5, components: 3 });
});

test("retains the exact reviewed jpeg-js decoder source", () => {
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(vendor)).digest("hex"),
    "a3f175fd6f62d142aad94d3bd90f3a30be4e076baf9b6a6fa31c8e84d9d4aa9f");
});

test("decodes a real four-component YCCK JPEG with canonical Adobe metadata", () => {
  const bytes = fs.readFileSync(ycckFixture);
  const inspected = preflightJpeg(bytes);
  assert.equal(inspected.frame.components, 4);
  assert.equal(inspected.frame.adobeTransform, 2);
  const decoded = decodeJpeg(bytes);
  assert.deepEqual([decoded.width, decoded.height, decoded.data.length], [7, 5, 35]);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),
    "f08b3604b7f68be9b6511750c3e69f1b1b911003c29ecba45492d512c5081de7");
  assert.equal(crypto.createHash("sha256").update(decoded.data).digest("hex"),
    "15744103660b1e8d64a833190f4af1095b60dbc767de839b0889b9e5c67684cb");
});

test("uses the canonical integer luminance conversion", () => {
  assert.deepEqual([...rgbToGrayscale(
    Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255]), 3, 1,
  )], [76, 150, 29]);
  assert.throws(() => rgbToGrayscale(Uint8Array.of(1, 2), 1, 1),
    (error) => error.code === "JPEG_RASTER_INVALID");
});

test("admits the supported frame families and rejects other SOF modes", () => {
  assert.equal(preflightJpeg(frame({ code: 0xc1 })).frame.kind, "extended");
  assert.equal(preflightJpeg(frame({ code: 0xc2 })).frame.kind, "progressive");
  failure(frame({ code: 0xc3 }), "JPEG_SOF_UNSUPPORTED");
  failure(frame({ precision: 12 }), "JPEG_PRECISION_UNSUPPORTED");
  failure(frame({ components: [[1, 0x11, 0], [2, 0x11, 1]] }),
    "JPEG_COMPONENTS_UNSUPPORTED");
});

test("enforces dimensions, pixels, input size, memory, and segment limits", () => {
  const bytes = fs.readFileSync(fixture);
  failure(bytes, "JPEG_DIMENSIONS_LIMIT", { maxWidth: 6 });
  failure(bytes, "JPEG_DIMENSIONS_LIMIT", { maxHeight: 4 });
  failure(bytes, "JPEG_PIXELS_LIMIT", { maxPixels: 34 });
  failure(bytes, "JPEG_INPUT_LIMIT", { maxInputBytes: bytes.length - 1 });
  failure(frame({ before: [segment(0xe0)] }), "JPEG_SEGMENTS_LIMIT", { maxSegments: 1 });
  failure(frame({ after: [segment(0xe0), segment(0xe1)] }),
    "JPEG_SEGMENTS_LIMIT", { maxSegments: 2 });
  assert.throws(() => decodeJpeg(bytes, { maxMemoryUsageBytes: 1 }),
    (error) => error.code === "JPEG_DECODE_INVALID");
});

test("counts standalone scan markers while ignoring stuffed entropy bytes", () => {
  const scanned = frame({ after: [
    segment(0xda),
    Buffer.from([
      0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0x01, 0x78,
    ]),
  ] });
  assert.equal(preflightJpeg(scanned, { maxSegments: 5 }).frame.width, 7);
  failure(scanned, "JPEG_SEGMENTS_LIMIT", { maxSegments: 4 });
});

test("rejects hostile component allocation declarations", () => {
  failure(frame({ components: [[1, 0x11, 0], [1, 0x11, 1], [3, 0x11, 1]] }),
    "JPEG_COMPONENTS_INVALID");
  failure(frame({ components: [[1, 0x01, 0]] }), "JPEG_SAMPLING_UNSUPPORTED");
  failure(frame({ components: [[1, 0x51, 0]] }), "JPEG_SAMPLING_UNSUPPORTED");
  failure(frame({ components: [[1, 0x44, 0]] }), "JPEG_SAMPLING_UNSUPPORTED");
  failure(frame({ components: [[1, 0x11, 4]] }), "JPEG_QUANTIZATION_UNSUPPORTED");
});

test("requires an unambiguous Adobe color transform for four components", () => {
  const components = [
    [1, 0x11, 0], [2, 0x11, 0], [3, 0x11, 0], [4, 0x11, 0],
  ];
  failure(frame({ components }), "JPEG_ADOBE_REQUIRED");
  failure(frame({ components, before: [adobe(1)] }),
    "JPEG_ADOBE_TRANSFORM_UNSUPPORTED");
  assert.equal(preflightJpeg(frame({ components, before: [adobe(0)] }))
    .frame.adobeTransform, 0);
  assert.equal(preflightJpeg(frame({ components, before: [adobe(2)] }))
    .frame.adobeTransform, 2);
  failure(frame({ components, before: [adobe(0), adobe(0)] }), "JPEG_ADOBE_INVALID");
});

test("rejects malformed envelopes and collapses third-party decode failures", () => {
  failure(Buffer.from("not jpeg"), "JPEG_SIGNATURE_INVALID");
  failure(Buffer.from([0xff, 0xd8, 0xff]), "JPEG_SIGNATURE_INVALID");
  failure(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]), "JPEG_SEGMENT_TRUNCATED");
  failure(Buffer.from([0xff, 0xd8, 0xff, 0xda]), "JPEG_SOF_MISSING");
  assert.throws(() => decodeJpeg(frame()), (error) => {
    assert.equal(error.code, "JPEG_DECODE_INVALID");
    assert.equal(error.message, "JPEG_DECODE_INVALID");
    return true;
  });
});

test("rejects misspelled and invalid limit controls", () => {
  failure(frame(), "JPEG_LIMIT_UNKNOWN", { maximumPixels: 2 });
  failure(frame(), "JPEG_LIMITS_INVALID", { maxPixels: 0 });
  failure(frame(), "JPEG_LIMITS_INVALID", null);
  failure(null, "JPEG_INPUT_INVALID");
});
