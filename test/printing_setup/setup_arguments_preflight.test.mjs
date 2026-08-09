// Verifies strict setup arguments and fail-closed legacy migration classification.
// No test opens a device, requests authorization, or changes managed files.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSetupArguments, SetupUsageError,
} from "../../libexec/printing_setup/setup_arguments.mjs";
import { classifySetupPreflight } from "../../libexec/printing_setup/setup_preflight.mjs";
import { existing, report, sudoEntry } from "./setup_test_support.mjs";

test("setup arguments accept only deterministic host and profile choices", () => {
  assert.deepEqual(parseSetupArguments([
    "--host", "192.168.50.41", "--profile", "printer.u220p",
  ]), { host: "192.168.50.41", profilePath: "printer.u220p", help: false });
  assert.throws(() => parseSetupArguments(["--host", "a", "--host", "b"]),
    SetupUsageError);
  assert.throws(() => parseSetupArguments(["--allow-offline"]), /unknown setup option/);
  assert.throws(() => parseSetupArguments(["--profile", "--allow-offline"]), /requires a value/);
});

test("preflight recognizes only the exact historical command shapes", () => {
  assert.equal(classifySetupPreflight(report()).state, "fresh");
  const ports = [1023, 1021, 1020, 1019, 1018, 1017, 1016, 1015]
    .map((source) => sudoEntry(source, 9100, 30));
  ports.push(...[731, 730, 729, 728, 727, 726, 725, 724, 723, 722, 721, 1022]
    .map((source) => sudoEntry(source, 515, 5)));
  const legacy = report({
    artifacts: { ...report().artifacts,
      sudoers: existing("/private/etc/sudoers.d/tm-u220-live-raw"),
      legacyTombstone: existing("/private/etc/sudoers.d/tm-u220-lpd") },
    authorization: { ...report().authorization,
      extra: ports.map((value) => value.command),
      extraDetails: ports.map((value) => value.detail) },
  });
  assert.deepEqual(classifySetupPreflight(legacy), {
    state: "legacy", legacyHost: "192.168.50.41", stale1022: true, legacyCommands: 20,
  });
  legacy.authorization.extraDetails[0].rootOnly = false;
  assert.throws(() => classifySetupPreflight(legacy), /does not match a recognized/);
  legacy.authorization.extraDetails[0].rootOnly = true;
  legacy.authorization.extra[0] = "/usr/bin/nc -w 30 -p 1023 192.168.50.99 9100";
  assert.throws(() => classifySetupPreflight(legacy), /does not match a recognized/);
});

test("preflight refuses unsafe paths and broad or weak passwordless grants", () => {
  const unsafe = report();
  unsafe.artifacts.sudoers = existing("/private/etc/sudoers.d/tm-u220-live-raw");
  unsafe.artifacts.sudoers.type = "symlink";
  assert.throws(() => classifySetupPreflight(unsafe), /unexpected type or metadata/);
  const broad = report();
  broad.authorization.broad = [{ command: "ALL" }];
  assert.throws(() => classifySetupPreflight(broad), /broad passwordless/);
  const weak = report();
  weak.authorization.misconfigured = [{ command: "/usr/bin/nc" }];
  assert.throws(() => classifySetupPreflight(weak), /lacks NOEXEC/);

  const parent = report();
  parent.pathSafety.safe = false;
  assert.throws(() => classifySetupPreflight(parent), /parent directory is unsafe/);
});
