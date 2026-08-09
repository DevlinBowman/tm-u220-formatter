// Verifies native setup selection remains structured, bounded, and independent of the shell directory.
// Tests inject the macOS process boundary and never open a dialog or contact a printer.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bundledProfilePath, loadProfileReference, resolveProfileReference,
} from "../../libexec/printing_setup/profile_reference.mjs";
import {
  describeProfile, parseSetupAssistantResult, runSetupAssistant,
} from "../../libexec/printing_setup/setup_assistant.mjs";
import { loadSelectedProfile } from "../../libexec/printing_policy/profile.mjs";

const root = "/Applications/TM-U220/current";
const checkoutRoot = fileURLToPath(new URL("../../", import.meta.url));

test("bundled profile references resolve against the running release", () => {
  const expected = path.join(root, "config/printers/local.u220p");
  assert.equal(bundledProfilePath(root), expected);
  for (const reference of ["default", "config/printers/local.u220p"]) {
    assert.equal(resolveProfileReference(reference,
      { applicationRoot: root, cwd: "/private/tmp/elsewhere" }), expected);
  }
  assert.equal(resolveProfileReference("./config/printers/local.u220p",
    { applicationRoot: root, cwd: "/private/tmp/elsewhere" }),
  "/private/tmp/elsewhere/config/printers/local.u220p");
  assert.equal(resolveProfileReference("custom.u220p",
    { applicationRoot: root, cwd: "/private/tmp/elsewhere" }),
  "/private/tmp/elsewhere/custom.u220p");
});

test("the shipped default profile loads from outside the checkout directory", () => {
  const loaded = loadProfileReference("default", {
    resolveProfileReference: (reference) => resolveProfileReference(reference,
      { applicationRoot: checkoutRoot, cwd: "/private/tmp/elsewhere" }),
    loadSelectedProfile,
  });
  assert.equal(loaded.path, path.join(checkoutRoot, "config/printers/local.u220p"));
  assert.equal(loaded.profile.options.variant, "B");
});

test("missing profile errors point to the stable included profile selector", () => {
  assert.throws(() => loadProfileReference("missing.u220p", {
    resolveProfileReference: () => "/private/tmp/missing.u220p",
    loadSelectedProfile: () => { throw Object.assign(new Error("absent"), { code: "ENOENT" }); },
  }), /--profile default.*existing \.u220p file/);
});

test("assistant uses a fixed no-shell osascript vector and parses its result", () => {
  let call;
  const value = runSetupAssistant({ host: null, suggestedHost: "192.168.50.40", profilePath: null,
    defaultProfilePath: `${root}/config/printers/local.u220p`,
    defaultProfileDescription: "TM-U220B, 76 mm paper" }, {
    scriptPath: "/fixed/setup_assistant.js",
    spawnSync(executable, args, options) {
      call = { executable, args, options };
      return { status: 0, stdout: JSON.stringify({ schemaVersion: 1,
        action: "continue", host: "192.168.50.41", profilePath: "/chosen/profile.u220p" }) };
    },
  });
  assert.deepEqual(value, { cancelled: false, host: "192.168.50.41",
    profilePath: "/chosen/profile.u220p" });
  assert.equal(call.executable, "/usr/bin/osascript");
  assert.deepEqual(call.args.slice(0, 3), ["-l", "JavaScript", "/fixed/setup_assistant.js"]);
  assert.equal(JSON.parse(call.args[3]).suggestedHost, "192.168.50.40");
  assert.equal(call.options.shell, false);
});

test("assistant protocol distinguishes cancellation and rejects malformed values", () => {
  assert.deepEqual(parseSetupAssistantResult(JSON.stringify({
    schemaVersion: 1, action: "cancel",
  })), { cancelled: true });
  assert.throws(() => parseSetupAssistantResult("not json"), /malformed/);
  assert.throws(() => parseSetupAssistantResult(JSON.stringify({
    schemaVersion: 1, action: "continue", host: {}, profilePath: "/profile",
  })), /invalid selections/);
});

test("included profile description is derived from canonical profile data", () => {
  assert.equal(describeProfile({ options: { variant: "B", paper: "76",
    dip2_1: "off", cutter: "partial" } }),
  "TM-U220B, 76 mm paper, DIP switch 2-1 off, partial cutter");
});
