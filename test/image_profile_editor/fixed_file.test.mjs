// Verifies the editor can replace only one private, user-owned profile atomically.
// Links, unsafe modes, stale metadata, and out-of-range profile bytes fail closed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readFixedProfile, revisionFor, writeFixedProfile,
} from "../../libexec/image_profile_editor/fixed_file.mjs";

function fixture(source = "!tm-u220 image-profile 1\ndensity=solid\n") {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u220-image-editor-"));
  fs.chmodSync(directory, 0o700);
  const profile = path.join(directory, "default.u220i");
  fs.writeFileSync(profile, source, { mode: 0o600 });
  return { directory, profile, source };
}

test("reads and atomically replaces one fixed private profile", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.directory, { recursive: true, force: true }));
  const current = readFixedProfile(item.profile);
  assert.equal(current.source, item.source);
  assert.equal(current.revision, revisionFor(item.source));

  const updated = "!tm-u220 image-profile 1\ndensity=detail\n";
  writeFixedProfile(item.profile, updated, current.stat);
  assert.equal(fs.readFileSync(item.profile, "utf8"), updated);
  assert.deepEqual(fs.readdirSync(item.directory), ["default.u220i"]);
  assert.equal(fs.lstatSync(item.profile).mode & 0o077, 0);
});

test("rejects stale, linked, and unsafe fixed profiles", (t) => {
  const stale = fixture();
  const linked = fixture();
  const writable = fixture();
  t.after(() => {
    for (const item of [stale, linked, writable]) {
      fs.rmSync(item.directory, { recursive: true, force: true });
    }
  });
  const current = readFixedProfile(stale.profile);
  fs.appendFileSync(stale.profile, "# changed\n");
  assert.throws(() => writeFixedProfile(stale.profile, current.source, current.stat),
    (error) => error.status === 409 && /changed on disk/.test(error.message));

  fs.linkSync(linked.profile, path.join(linked.directory, "other.u220i"));
  assert.throws(() => readFixedProfile(linked.profile), /single-link regular file/);
  fs.chmodSync(writable.profile, 0o620);
  assert.throws(() => readFixedProfile(writable.profile), /single-link regular file/);
});

test("rejects a symlink and an unsafe parent directory", (t) => {
  const symlinked = fixture();
  const directory = fixture();
  t.after(() => {
    fs.rmSync(symlinked.directory, { recursive: true, force: true });
    fs.rmSync(directory.directory, { recursive: true, force: true });
  });
  const outside = path.join(symlinked.directory, "outside.u220i");
  fs.renameSync(symlinked.profile, outside);
  fs.symlinkSync(outside, symlinked.profile);
  assert.throws(() => readFixedProfile(symlinked.profile), /single-link regular file/);
  fs.chmodSync(directory.directory, 0o770);
  assert.throws(() => readFixedProfile(directory.profile), /directory is not safely user-owned/);
});
