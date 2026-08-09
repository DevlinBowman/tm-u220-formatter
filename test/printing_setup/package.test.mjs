// Verifies the flattened package contains exactly the four reviewed policy artifacts and metadata.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalPackageContract, defaultPackageVersion,
} from "../../libexec/printing_policy/package_contract.mjs";
import { expectedBomLines } from "../../libexec/printing_policy/package_validation.mjs";
import {
  createPrintingPolicy, parseProfile, printingPolicy,
} from "../../libexec/printing_setup/policy.mjs";
import { buildPackage, packagePolicy } from "../../libexec/printing_setup/package.mjs";
import { buildReviewerApp } from "../../libexec/printing_setup/app_bundle.mjs";

const PROFILE = Buffer.from([
  "!tm-u220 profile 1", "variant=B", "paper=69.5", "dip2_1=on", "cutter=partial", "",
].join("\n"));

function policy() {
  return createPrintingPolicy({
    identity: { name: "receipt_user", uid: 812 },
    host: "172.20.30.40",
    profile: parseProfile(PROFILE),
    probe: { mode: "offline", recordedAt: "2026-08-08T17:00:00.000Z",
      error: "connection_refused", acceptance: "allow_offline" },
  });
}

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test("package contract is product-neutral, deterministic, fixed, and immutable", () => {
  const value = policy();
  const contract = canonicalPackageContract(value, "2.4.6");
  assert.equal(contract.identifier, "org.tm-u220.printing-policy");
  assert.equal(contract.name, "TM-U220 Printing Policy.pkg");
  assert.equal(contract.scripts, false);
  assert.deepEqual(contract.artifacts.map(({ path, mode }) => [path, mode]), [
    ["/private/etc/sudoers.d/tm-u220-live-raw", 0o440],
    ["/private/etc/sudoers.d/tm-u220-lpd", 0o440],
    ["/private/etc/tm-u220/printer.u220p", 0o444],
    ["/private/etc/tm-u220/printing.conf", 0o444],
  ]);
  assert.deepEqual(contract.payloadPaths, [
    ".", "./private", "./private/etc", "./private/etc/sudoers.d",
    "./private/etc/sudoers.d/tm-u220-live-raw", "./private/etc/sudoers.d/tm-u220-lpd",
    "./private/etc/tm-u220", "./private/etc/tm-u220/printer.u220p",
    "./private/etc/tm-u220/printing.conf",
  ]);
  assert.deepEqual(expectedBomLines(contract), [
    ".\t40755\t0\t0", "./private\t40755\t0\t0", "./private/etc\t40755\t0\t0",
    "./private/etc/sudoers.d\t40755\t0\t0",
    "./private/etc/sudoers.d/tm-u220-live-raw\t100440\t0\t0",
    "./private/etc/sudoers.d/tm-u220-lpd\t100440\t0\t0",
    "./private/etc/tm-u220\t40755\t0\t0",
    "./private/etc/tm-u220/printer.u220p\t100444\t0\t0",
    "./private/etc/tm-u220/printing.conf\t100444\t0\t0",
  ]);
  assert.equal(defaultPackageVersion(value.manifest, new Date("2026-08-08T17:01:02.000Z")),
    defaultPackageVersion(value.manifest, new Date("2026-08-08T17:01:02.000Z")));
  assert.equal(defaultPackageVersion({ bytes: value.manifest.bytes, hash: "0".repeat(64) },
    new Date("2026-08-08T17:01:02.000Z")),
    defaultPackageVersion(value.manifest, new Date("2026-08-08T17:01:02.000Z")));
  assert.throws(() => canonicalPackageContract(value, "1.bad"), /numeric components/);
  assert.throws(() => contract.payloadPaths.push("./extra"), TypeError);
});

test("real package has exact scripts-free metadata, BOM, archive, and artifact bytes", {
  skip: process.platform !== "darwin",
}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "u220-package-policy-"));
  try {
    const value = policy();
    const installer = buildPackage(directory, value, { packageVersion: "2.4.6" });
    assert.equal(installer.identifier, printingPolicy.package.identifier);
    assert.equal(installer.name, printingPolicy.package.name);
    assert.equal(installer.scripts, false);
    assert.equal(installer.payload.length, 4);
    assert.throws(() => installer.payload.push({}), TypeError);
    const expanded = path.join(directory, "independent-expansion");
    command("/usr/sbin/pkgutil", ["--expand", installer.path, expanded]);
    assert.deepEqual(fs.readdirSync(expanded).sort(), ["Bom", "PackageInfo", "Payload"]);
    const info = fs.readFileSync(path.join(expanded, "PackageInfo"), "utf8");
    assert.match(info, /identifier="org\.tm-u220\.printing-policy"/);
    assert.match(info, /version="2\.4\.6"/);
    assert.match(info, /overwrite-permissions="true" relocatable="false"/);
    assert.match(info, /install-location="\/" auth="root"/);
    assert.match(info, /numberOfFiles="9"/);
    assert.equal(/<scripts|<preinstall|<postinstall/.test(info), false);
    const bom = command("/usr/bin/lsbom", ["-p", "fmug", path.join(expanded, "Bom")]);
    assert.deepEqual(bom.stdout.trimEnd().split(/\r?\n/),
      expectedBomLines(canonicalPackageContract(value, "2.4.6")));
    const payload = fs.readFileSync(path.join(expanded, "Payload"));
    const listing = command("/usr/bin/cpio", ["-it", "--quiet"], { input: payload });
    assert.deepEqual(listing.stdout.trimEnd().split(/\r?\n/),
      canonicalPackageContract(value, "2.4.6").payloadPaths);
    const metadata = command("/usr/bin/cpio", ["-itv", "--quiet"], { input: payload });
    assert.ok(metadata.stdout.trimEnd().split(/\r?\n/).every((line) => {
      const fields = line.trim().split(/\s+/);
      return fields[2] === "root" && fields[3] === "wheel";
    }));
    const signature = spawnSync("/usr/sbin/pkgutil", ["--check-signature", installer.path],
      { encoding: "utf8" });
    assert.notEqual(signature.status, 0);
    assert.match(`${signature.stdout}${signature.stderr}`, /no signature/i);
    const reviewer = buildReviewerApp(directory, {
      bundle: value, packageInfo: installer, preflight: { state: "fresh" },
      scriptPath: fileURLToPath(new URL("../../libexec/printing_setup/reviewer.js", import.meta.url)),
    });
    const resources = path.join(reviewer.path, "Contents", "Resources");
    assert.deepEqual(fs.readFileSync(path.join(resources, installer.name)), installer.bytes);
    assert.match(fs.readFileSync(reviewer.reviewPath, "utf8"), /arbitrary standard-input bytes/i);
    const appInfo = command("/usr/bin/plutil", ["-p", path.join(
      reviewer.path, "Contents", "Info.plist",
    )]);
    assert.match(appInfo.stdout, /TM-U220 Printing Setup/);
    command("/usr/bin/codesign", ["--verify", "--strict", reviewer.path]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("builder refuses non-private, nonempty, or symlinked workspaces", {
  skip: process.platform !== "darwin",
}, () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "u220-workspace-policy-"));
  try {
    const loose = path.join(parent, "loose");
    fs.mkdirSync(loose, { mode: 0o755 });
    assert.throws(() => buildPackage(loose, policy(), { packageVersion: "1.2" }), /mode 0700/);
    const nonempty = path.join(parent, "nonempty");
    fs.mkdirSync(nonempty, { mode: 0o700 });
    fs.writeFileSync(path.join(nonempty, "existing"), "x");
    assert.throws(() => buildPackage(nonempty, policy(), { packageVersion: "1.2" }), /empty/);
    const real = path.join(parent, "real");
    fs.mkdirSync(real, { mode: 0o700 });
    const linked = path.join(parent, "linked");
    fs.symlinkSync(real, linked);
    assert.throws(() => buildPackage(linked, policy(), { packageVersion: "1.2" }), /regular directory/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("contract revalidates profile and manifest rather than trusting caller objects", () => {
  const value = policy();
  const other = Buffer.from(PROFILE.toString().replace("paper=69.5", "paper=76"));
  assert.throws(() => canonicalPackageContract({ ...value, profile: { bytes: other } }, "1.2"),
    /do not match/);
  const manifest = value.manifest.bytes;
  const changed = Buffer.from(manifest.toString().replace("lpd_queue=lp", "lpd_queue=xp"));
  assert.throws(() => canonicalPackageContract({ ...value, manifest: { bytes: changed } }, "1.2"),
    /differs from fixed/);
  assert.deepEqual(packagePolicy, {
    identifier: "org.tm-u220.printing-policy", name: "TM-U220 Printing Policy.pkg",
    scripts: false, payloadFiles: 4,
  });
});

test("builder rejects package replacement after external validation", {
  skip: process.platform !== "darwin",
}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "u220-package-race-"));
  try {
    let replaced = false;
    const runtime = { packageVersion: "1.2", spawnSync(executable, args, options) {
      const result = spawnSync(executable, args, options);
      if (!replaced && executable === "/usr/sbin/pkgutil" && args[0] === "--check-signature") {
        const replacement = path.join(directory, "unvalidated.pkg");
        fs.writeFileSync(replacement, "unvalidated replacement");
        fs.renameSync(replacement, args[1]);
        replaced = true;
      }
      return result;
    } };
    assert.throws(() => buildPackage(directory, policy(), runtime), /changed during final validation/);
    assert.equal(replaced, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("an explicitly empty package version is invalid instead of silently defaulted", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "u220-package-version-"));
  try {
    assert.throws(() => buildPackage(directory, policy(), { packageVersion: "" }),
      /numeric components/);
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
