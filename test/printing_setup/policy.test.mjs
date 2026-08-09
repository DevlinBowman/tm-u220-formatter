// Verifies strict canonical manifest generation, privileged rendering, and complete review disclosure.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  captureCurrentIdentity, createPrintingPolicy, loadInstalledPolicy, loadSelectedProfile,
  parseManifest, parseProfile, printingPolicy, renderLegacyTombstone, renderSudoers,
  reviewText, validatePrinterIPv4,
} from "../../libexec/printing_setup/policy.mjs";
const PROFILE = Buffer.from([
  "!tm-u220 profile 1", "variant=A", "paper=76", "dip2_1=off", "cutter=full", "",
].join("\n"));
const RECORDED_AT = "2026-08-08T15:04:05.000Z";
function policy(overrides = {}) {
  return createPrintingPolicy({
    identity: overrides.identity || { name: "printuser", uid: 777 },
    host: overrides.host || "192.168.44.17",
    profile: overrides.profile || parseProfile(PROFILE),
    probe: overrides.probe || {
      mode: "deferred", recordedAt: RECORDED_AT,
      reason: "privileged_source_required",
    },
  });
}
test("one manifest drives arbitrary account, endpoint, profile, queue, and fixed routes", () => {
  const value = policy();
  const text = value.manifest.bytes.toString("utf8");
  assert.match(text, /^!tm-u220 printing-policy 1\n/);
  assert.match(text, /account_name=printuser\naccount_uid=777\n/);
  assert.match(text, /printer_ipv4=192\.168\.44\.17/);
  assert.match(text, /profile_path=\/private\/etc\/tm-u220\/printer\.u220p/);
  assert.match(text, /lpd_queue=lp/);
  assert.deepEqual(value.manifest.routes.map((route) => ({
    name: route.name, host: route.host, port: route.destinationPort,
    timeout: route.timeoutSeconds, ports: [...route.sourcePorts], queue: route.queue,
  })), [
    { name: "live", host: "192.168.44.17", port: 9100, timeout: 30,
      ports: [1023, 1021, 1020, 1019, 1018, 1017, 1016, 1015], queue: undefined },
    { name: "lpd", host: "192.168.44.17", port: 515, timeout: 5,
      ports: [731, 730, 729, 728, 727, 726, 725, 724, 723, 722, 721], queue: "lp" },
  ]);
  assert.equal(value.manifest.profile.hash, value.profile.hash);
  assert.equal(value.manifest.profile.byteLength, value.profile.byteLength);
  assert.equal(Object.isFrozen(printingPolicy.routes[0].sourcePorts), true);
  assert.throws(() => printingPolicy.routes[0].sourcePorts.push(999), TypeError);
});
test("only canonical private or link-local numeric IPv4 destinations are accepted", () => {
  for (const value of ["10.2.3.4", "172.31.8.9", "192.168.2.3", "169.254.20.30"]) {
    assert.equal(validatePrinterIPv4(value), value);
  }
  for (const value of ["printer.local", "8.8.8.8", "127.0.0.1", "224.1.2.3",
    "192.168.001.2", "192.168.1.2;id", "192.168.1.256", "192.168.1"]) {
    assert.throws(() => validatePrinterIPv4(value));
  }
});
test("current identity must be a matching non-root real and effective account", () => {
  assert.deepEqual(captureCurrentIdentity({
    userInfo: () => ({ username: "local_user", uid: 502 }),
    getuid: () => 502, geteuid: () => 502,
  }), { name: "local_user", uid: 502 });
  assert.throws(() => captureCurrentIdentity({
    userInfo: () => ({ username: "root", uid: 0 }), getuid: () => 0, geteuid: () => 0,
  }), /outside the allowed range/);
  assert.throws(() => captureCurrentIdentity({
    userInfo: () => ({ username: "alice", uid: 501 }), getuid: () => 501, geteuid: () => 0,
  }), /does not match/);
  assert.throws(() => policy({ identity: { name: "bad name", uid: 501 } }), /unsafe/);
});
test("manifest parsing rejects ambiguity, route drift, invalid evidence, and hash syntax", () => {
  const bytes = policy().manifest.bytes;
  const mutate = (from, to) => Buffer.from(bytes.toString("utf8").replace(from, to));
  assert.throws(() => parseManifest(Buffer.from(bytes.toString("utf8").trimEnd())), /end with LF/);
  assert.throws(() => parseManifest(mutate("\naccount_uid=777", "\r\naccount_uid=777")), /LF/);
  assert.throws(() => parseManifest(mutate("account_uid=777", "account_uid=0777")), /canonical integer/);
  assert.throws(() => parseManifest(mutate("live_destination_port=9100", "live_destination_port=9000")),
    /differs from fixed/);
  assert.throws(() => parseManifest(mutate("lpd_queue=lp", "lpd_queue=raw")), /differs from fixed/);
  assert.throws(() => parseManifest(mutate(
    "probe_reason=privileged_source_required", "probe_reason=ordinary_probe_required")),
  /privileged_source_required/);
  assert.throws(() => parseManifest(mutate("profile_sha256=", "profile_sha256=Z")), /SHA-256/);
  assert.throws(() => parseManifest(mutate("account_uid=777\n", "unknown=value\naccount_uid=777\n")),
    /appear exactly/);
  assert.throws(() => policy({ probe: { mode: "offline", recordedAt: RECORDED_AT,
    error: "wrong_device" } }), /unknown error/);
});
test("current deferred evidence and legacy schema-one records remain distinct", () => {
  const cases = [
    [{ mode: "deferred", recordedAt: RECORDED_AT,
      reason: "privileged_source_required" },
    { mode: "deferred", reason: "privileged_source_required" }],
    [{ mode: "verified", recordedAt: RECORDED_AT, model: "TM-U220", modelId: 13 },
      { mode: "verified", model: "TM-U220", modelId: 13 }],
    [{ mode: "offline", recordedAt: RECORDED_AT, error: "timeout",
      acceptance: "allow_offline" },
      { mode: "offline", error: "timeout", acceptance: "allow_offline" }],
  ];
  for (const [input, expected] of cases) {
    const probe = parseManifest(policy({ probe: input }).manifest.bytes).probe;
    for (const [key, value] of Object.entries(expected)) assert.equal(probe[key], value);
    assert.equal(probe.recordedAt, RECORDED_AT);
  }
  assert.throws(() => policy({ probe: { mode: "waived", recordedAt: RECORDED_AT,
    reason: "user_skipped" } }), /verified, deferred, or explicitly accepted offline/);
  assert.throws(() => policy({ probe: { mode: "offline", recordedAt: RECORDED_AT,
    error: "timeout" } }), /explicit allow_offline/);
});
test("selected profiles are exact hashed regular files and reject links or invalid hardware", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "u220-profile-policy-"));
  try {
    const source = path.join(directory, "source.u220p");
    fs.writeFileSync(source, PROFILE);
    assert.equal(loadSelectedProfile(source).hash, parseProfile(PROFILE).hash);
    const symlink = path.join(directory, "symlink.u220p");
    fs.symlinkSync(source, symlink);
    assert.throws(() => loadSelectedProfile(symlink), /symbolic link/);
    const hardlink = path.join(directory, "hardlink.u220p");
    fs.linkSync(source, hardlink);
    assert.throws(() => loadSelectedProfile(source), /exactly one filesystem link/);
    assert.throws(() => parseProfile(Buffer.from(PROFILE.toString().replace("variant=A", "variant=D"))),
      /no autocutter/);
    assert.throws(() => parseProfile(Buffer.from(PROFILE.toString().replace("paper=76", "paper=69.5"))),
      /only 76 mm/);
    assert.throws(() => parseProfile(Buffer.concat([PROFILE, Buffer.from([0x1b])])),
      /printable ASCII/);
    assert.throws(() => parseProfile(Buffer.from(`# comment\rspoof\n${PROFILE}`)),
      /LF line endings/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test("sudoers is UID-bound, immutable-by-copy, exact, and accepted by visudo", () => {
  const value = policy();
  const rule = renderSudoers(value.manifest);
  assert.equal(rule.commands.length, 19);
  assert.equal(rule.bytes.toString().split("\n").filter(Boolean).length, 19);
  assert.match(rule.bytes.toString(), /^#777 ALL=\(root\) NOPASSWD:NOEXEC:NOSETENV:/);
  assert.equal(rule.bytes.toString().includes("printuser ALL"), false);
  assert.ok(rule.commands.every((command) => /^\/usr\/bin\/nc -w \d+ -p \d+ 192\.168\.44\.17 (9100|515)$/.test(command)));
  const changed = rule.bytes;
  changed[0] = 0;
  assert.equal(rule.bytes[0], 35);
  const tombstone = renderLegacyTombstone();
  assert.match(tombstone.bytes.toString(), /intentionally grants no commands/);
  for (const bytes of [rule.bytes, tombstone.bytes]) {
    const result = spawnSync("/usr/sbin/visudo", ["-cf", "-"], { input: bytes, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
});
test("installed loader binds root-owned manifest and profile hashes", () => {
  const value = policy();
  const byPath = new Map([
    [printingPolicy.artifacts.manifest.path, value.manifest.bytes],
    [printingPolicy.artifacts.profile.path, value.profile.bytes],
  ]);
  const runtime = { readConstrainedFile(filePath) {
    const bytes = byPath.get(filePath);
    return { bytes, stat: { size: bytes.length } };
  } };
  assert.equal(loadInstalledPolicy(runtime).manifest.hash, value.manifest.hash);
  byPath.set(printingPolicy.artifacts.profile.path, Buffer.from(PROFILE.toString().replace("full", "partial")));
  assert.throws(() => loadInstalledPolicy(runtime), /does not match/);
});
test("review dynamically discloses every artifact, risk, migration, hashes, and undo", () => {
  const value = policy();
  const packageBytes = Buffer.from("test package bytes");
  const packageInfo = { hash: "32610151b1061201110cf0f86dcd39077a45711d87f46e5d813ec908156f67b7",
    bytes: packageBytes, version: "1.2.3",
    identifier: printingPolicy.package.identifier, name: printingPolicy.package.name,
    scripts: false,
    payload: Object.values(value.artifacts).map((artifact) => ({
      path: artifact.path, hash: artifact.hash, byteLength: artifact.byteLength,
      mode: artifact.mode, uid: artifact.uid, gid: artifact.gid,
    })) };
  const review = reviewText(value, packageInfo);
  for (const artifact of Object.values(value.artifacts)) {
    assert.ok(review.includes(artifact.path));
    assert.ok(review.includes(artifact.hash));
    for (const line of artifact.bytes.toString("utf8").trimEnd().split("\n")) {
      assert.ok(review.includes(`  | ${line}`));
    }
  }
  assert.match(review, /arbitrary standard-input bytes/i);
  assert.match(review, /plaintext, unauthenticated LAN transports/i);
  assert.match(review, /single authorization source/);
  assert.match(review, /inert reviewed tombstone/);
  assert.match(review, /sudo \/bin\/rm \/private\/etc\/tm-u220\/printing\.conf/);
  assert.match(review, /pkgutil --forget org\.tm-u220\.printing-policy/);
  assert.match(review, /unsigned/);
  assert.match(review, /Scripts: none/);
  assert.match(review, /printuser \(UID 777\)/);
  assert.match(review, /192\.168\.44\.17:9100/);
  const forged = { ...value, manifest: { ...value.manifest, identity: { name: "forged", uid: 9 } },
    artifacts: {}, sudoers: { commands: ["forged"] } };
  const reparsedReview = reviewText(forged, packageInfo);
  assert.equal(reparsedReview.includes("forged"), false);
  assert.match(reparsedReview, /printuser \(UID 777\)/);
});
