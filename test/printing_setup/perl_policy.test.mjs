// Verifies that the Perl LPD boundary accepts the canonical manifest and rejects route drift.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createManifest } from "../../libexec/printing_policy/index.mjs";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const library = path.join(root, "libexec", "lpd_session");
const script = [
  "local $/;",
  "my $p = parse_manifest(<STDIN>);",
  "print join(q{|}, $p->{host}, $p->{queue}, $p->{destination_port},",
  "  $p->{timeout}, join(q{,}, @{$p->{source_ports}}));",
].join(" ");

function manifest() {
  return createManifest({
    identity: { name: "printer_user", uid: 502 },
    host: "192.168.50.41",
    profile: Buffer.from("!tm-u220 profile 1\nvariant=B\npaper=76\ndip2_1=off\ncutter=partial\n"),
    probe: { mode: "verified", recordedAt: "2026-08-08T12:34:56.789Z",
      model: "TM-U220", modelId: 13 },
  }).bytes;
}

function parse(bytes) {
  return spawnSync("/usr/bin/perl", [
    `-I${library}`, "-MPrintingPolicy=parse_manifest", "-e", script,
  ], { input: bytes, encoding: "utf8" });
}

test("Perl helper derives its complete LPD route from the canonical manifest", () => {
  const result = parse(manifest());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout,
    "192.168.50.41|lp|515|5|731,730,729,728,727,726,725,724,723,722,721");
});

test("Perl helper rejects a changed installed route", () => {
  const changed = Buffer.from(manifest().toString("utf8")
    .replace("lpd_destination_port=515", "lpd_destination_port=516"));
  const result = parse(changed);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /differs from fixed printing policy/);
});

test("Perl helper rejects non-canonical scalars and unaccepted offline evidence", () => {
  const leading = Buffer.from(manifest().toString("utf8")
    .replace("account_uid=502", "account_uid=0502"));
  assert.notEqual(parse(leading).status, 0);

  const offline = Buffer.from(manifest().toString("utf8")
    .replace("probe_mode=verified\nprobe_recorded_at=2026-08-08T12:34:56.789Z\n"
      + "probe_model=TM-U220\nprobe_model_id=13",
    "probe_mode=offline\nprobe_recorded_at=2026-08-08T12:34:56.789Z\n"
      + "probe_error=timeout\nprobe_acceptance=not_accepted"));
  const result = parse(offline);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /offline probe evidence is invalid/);
});
