// Exercises canonical optimistic persistence for the fixed image-profile file.
// Invalid drafts and stale revisions must leave the on-disk source unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ImageProfileStore } from "../../libexec/image_profile_editor/profile_store.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const factory = path.join(root, "config/images/default.u220i");

function fixture() {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u220-profile-store-"));
  fs.chmodSync(directory, 0o700);
  const profile = path.join(directory, "default.u220i");
  fs.copyFileSync(factory, profile);
  fs.chmodSync(profile, 0o600);
  return { directory, profile, store: new ImageProfileStore(profile, root) };
}

test("read and save return canonical schema-bound profile state", async (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const first = await item.store.read();
  assert.equal(first.profile_name, "default.u220i");
  assert.equal(first.image_profile.dither, "floyd");
  assert.equal(first.schema.fields.length, 10);

  const draft = first.source.replace("dither=floyd", "dither=ordered");
  const saved = await item.store.save({ source: draft, revision: first.revision });
  assert.equal(saved.image_profile.dither, "ordered");
  assert.equal(saved.source, draft);
  assert.notEqual(saved.revision, first.revision);
  assert.equal(fs.readFileSync(item.profile, "utf8"), draft);
});

test("invalid and stale saves preserve the current profile", async (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const first = await item.store.read();
  const before = fs.readFileSync(item.profile, "utf8");
  await assert.rejects(() => item.store.save({
    source: first.source.replace("threshold=128", "threshold=999"),
    revision: first.revision,
  }), (error) => error.status === 422 && Array.isArray(error.diagnostics));
  assert.equal(fs.readFileSync(item.profile, "utf8"), before);

  fs.appendFileSync(item.profile, "\n");
  const changed = fs.readFileSync(item.profile, "utf8");
  await assert.rejects(() => item.store.save({
    source: first.source, revision: first.revision,
  }), (error) => error.status === 409);
  assert.equal(fs.readFileSync(item.profile, "utf8"), changed);
});
