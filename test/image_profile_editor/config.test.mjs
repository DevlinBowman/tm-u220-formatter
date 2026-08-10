// Verifies editor startup fixes one source image, printer profile, and editable image profile.
// Managed releases seed only the user's image profile while checkouts edit their factory copy.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEditorConfig } from "../../libexec/image_profile_editor/config.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const image = path.join(projectRoot, "test/assets/Chicken.png");
const printer = path.join(projectRoot, "config/printers/local.u220p");

test("checkout config resolves its fixed image and checked-in image profile", async () => {
  const config = await parseEditorConfig([
    image, "--profile", printer, "--port", "8123", "--no-open",
  ], projectRoot);
  assert.equal(config.target, fs.realpathSync(image));
  assert.equal(config.profile, fs.realpathSync(printer));
  assert.equal(config.imageProfile,
    fs.realpathSync(path.join(projectRoot, "config/images/default.u220i")));
  assert.equal(config.port, 8123);
  assert.equal(config.open, false);
  assert.equal(config.host, "127.0.0.1");
});

test("managed config seeds only the fixed user image profile", async (t) => {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u220-profile-config-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, "release");
  const user = path.join(base, "user");
  const target = path.join(base, "source.png");
  const physical = path.join(base, "printer.u220p");
  fs.mkdirSync(path.join(root, "config/images"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(root, ".tm-u220-install.json"), "{}", { mode: 0o600 });
  fs.copyFileSync(path.join(projectRoot, "config/images/default.u220i"),
    path.join(root, "config/images/default.u220i"));
  fs.copyFileSync(image, target);
  fs.copyFileSync(printer, physical);

  const config = await parseEditorConfig([target, "--profile", physical], root, {
    environment: { TM_U220_CONFIG_HOME: user }, uid: process.getuid(),
  });
  assert.equal(config.imageProfile, fs.realpathSync(path.join(user, "images/default.u220i")));
  assert.equal(fs.existsSync(path.join(user, "directives")), false);
  assert.equal(fs.existsSync(path.join(user, "printers")), false);
  assert.equal(fs.readFileSync(config.imageProfile, "utf8"),
    fs.readFileSync(path.join(root, "config/images/default.u220i"), "utf8"));
});

test("config rejects ambiguous inputs, unsafe ports, and root execution", async () => {
  await assert.rejects(() => parseEditorConfig([image], projectRoot), /one image and --profile/);
  await assert.rejects(() => parseEditorConfig([
    image, "extra.png", "--profile", printer,
  ], projectRoot), /one image and --profile/);
  await assert.rejects(() => parseEditorConfig([
    image, "--profile", printer, "--port", "70000",
  ], projectRoot), /0 through 65535/);
  await assert.rejects(() => parseEditorConfig([
    image, "--profile", printer,
  ], projectRoot, { uid: 0 }), /not root or sudo/);
});
