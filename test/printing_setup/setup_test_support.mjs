// Supplies compact, non-mutating reports and workflow services for setup tests.
// It records the one authorized device contact that may follow verified installation.
import fs from "node:fs";
import path from "node:path";
import { parseSetupArguments } from "../../libexec/printing_setup/setup_arguments.mjs";
import { classifySetupPreflight } from "../../libexec/printing_setup/setup_preflight.mjs";

export function artifact(pathname, overrides = {}) {
  return {
    path: pathname, exists: false, type: "absent", uid: null, gid: null,
    mode: null, size: null, metadataValid: false,
    expected: { mode: pathname.includes("sudoers") ? "0440" : "0444" },
    schema: { valid: false }, ...overrides,
  };
}

export function report(overrides = {}) {
  const value = {
    healthy: false, environment: { platform: { supported: true } },
    pathSafety: { safe: true }, configuration: null,
    artifacts: {
      manifest: artifact("/private/etc/tm-u220/printing.conf"),
      profile: artifact("/private/etc/tm-u220/printer.u220p"),
      sudoers: artifact("/private/etc/sudoers.d/tm-u220-live-raw"),
      legacyTombstone: artifact("/private/etc/sudoers.d/tm-u220-lpd",
        { expected: { mode: "0440" } }),
    },
    authorization: { available: true, expected: [], active: [], missing: [], extra: [],
      extraDetails: [], misconfigured: [], broad: [], exact: false },
  };
  return Object.assign(value, overrides);
}

export function existing(pathname, mode = "0440") {
  return artifact(pathname, { exists: true, type: "regular_file", uid: 0, gid: 0,
    links: 1, mode, size: 80, metadataValid: true, expected: { mode } });
}

export function sudoEntry(source, destination, timeout, host = "192.168.50.41") {
  const command = `/usr/bin/nc -w ${timeout} -p ${source} ${host} ${destination}`;
  return { command, detail: { command, rootOnly: true, nopasswd: true,
    noexec: true, nosetenv: true } };
}

export function workflowFixture(reviewerStatus = "installer-closed\n",
  assistantResult = { cancelled: false, host: "192.168.50.41",
    profilePath: "printer.u220p" }) {
  const output = { stdout: "", stderr: "" };
  const io = {
    stdout: { write: (value) => { output.stdout += value; } },
    stderr: { write: (value) => { output.stderr += value; } },
  };
  const bundle = {
    identity: { name: "sample_user", uid: 502 }, manifest: { host: "192.168.50.41" },
    sudoers: { commands: Array.from({ length: 19 }, (_, index) => `command-${index}`) },
    artifacts: { manifest: { hash: "a".repeat(64) }, profile: { hash: "b".repeat(64) } },
  };
  const after = {
    healthy: true, issues: [], packageReceipt: { version: "1.2.3" },
    artifacts: { manifest: { sha256: "a".repeat(64) },
      profile: { sha256: "b".repeat(64) } },
    configuration: { account: bundle.identity,
      endpoint: { host: "192.168.50.41", port: 9100 } },
    authorization: { exact: true },
  };
  let audits = 0;
  let built = false;
  let deviceContacts = 0;
  let assistedInput = null;
  let policyInput = null;
  const services = {
    parseArguments: parseSetupArguments, assertEnvironment: () => true,
    captureIdentity: () => bundle.identity,
    loadInstalledPolicy: () => { throw new Error("absent"); },
    loadSelectedProfile: () => ({ bytes: Buffer.from("profile") }),
    resolveProfileReference: (value) => value,
    validateHost: (value) => value,
    selectSetup: (input) => { assistedInput = input; return assistantResult; },
    audit: () => (++audits === 1 ? report() : after),
    classifyPreflight: classifySetupPreflight,
    createPolicy: (input) => {
      policyInput = input;
      bundle.manifest.probe = input.probe;
      return bundle;
    },
    buildPackage: () => { built = true; return { version: "1.2.3" }; },
    buildReviewer: (directory) => {
      const resultPath = path.join(directory, "result");
      fs.writeFileSync(resultPath, reviewerStatus);
      return { path: path.join(directory, "reviewer.app"), resultPath };
    },
    launchReviewer: () => true,
    checkDevice: async () => {
      deviceContacts += 1;
      return { outcome: "verified", identity: { verified: true },
        readiness: { checked: true, ready: true, reasons: [] } };
    },
    reviewerScriptPath: "/reviewer.js",
  };
  return { services, io, output,
    state: () => ({ audits, built, deviceContacts }),
    assistedInput: () => assistedInput,
    policyInput: () => policyInput };
}
