// Proves Node-generated canonical manifests have identical security meaning in the Lua runtime.
// Mutated route and evidence forms must be rejected before local printing can select them.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createManifest } from "../../libexec/printing_policy/index.mjs";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const profile = Buffer.from([
  "!tm-u220 profile 1", "variant=B", "paper=76", "dip2_1=off", "cutter=partial", "",
].join("\n"));
const script = [
  'package.path="src/?.lua;src/?/init.lua;" .. package.path',
  'local M=require("tm_u220.printing.manifest")',
  'local value,err=M.parse(io.read("*a"))',
  'if not value then io.stderr:write(err,"\\n"); os.exit(1) end',
  'io.write(value.host,"|",value.probe.mode,"|",value.probe.acceptance or "-","|",'
    + 'value.routes.live.port,"|",value.routes.lpd.queue)',
].join("; ");

function manifest(probe) {
  return createManifest({ identity: { name: "runtime_user", uid: 604 },
    host: "172.20.30.40", profile, probe }).bytes;
}

function parse(bytes) {
  return spawnSync("lua", ["-e", script], { cwd: root, input: bytes, encoding: "utf8" });
}

test("Lua consumes verified and explicitly accepted offline Node manifests", () => {
  const verified = parse(manifest({ mode: "verified",
    recordedAt: "2026-08-08T12:34:56.000Z", model: "TM-U220", modelId: 13 }));
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(verified.stdout, "172.20.30.40|verified|-|9100|lp");

  const offline = parse(manifest({ mode: "offline",
    recordedAt: "2026-08-08T12:34:56.000Z", error: "timeout",
    acceptance: "allow_offline" }));
  assert.equal(offline.status, 0, offline.stderr);
  assert.equal(offline.stdout, "172.20.30.40|offline|allow_offline|9100|lp");
});

test("Lua rejects cross-runtime route, scalar, and offline-acceptance drift", () => {
  const original = manifest({ mode: "offline",
    recordedAt: "2026-08-08T12:34:56.000Z", error: "timeout",
    acceptance: "allow_offline" }).toString("utf8");
  for (const [from, to] of [
    ["account_uid=604", "account_uid=0604"],
    ["live_destination_port=9100", "live_destination_port=9000"],
    ["probe_acceptance=allow_offline", "probe_acceptance=implicit"],
  ]) {
    const result = parse(Buffer.from(original.replace(from, to)));
    assert.notEqual(result.status, 0, `${from} mutation was accepted`);
  }
});
