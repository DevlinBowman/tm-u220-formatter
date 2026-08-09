// Orchestrates selection, byte-exact review, Apple Installer, and final authorization audit.
// Printer contact waits until the reviewed privileged-source bypass exists.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SETUP_USAGE } from "./setup_arguments.mjs";
import { resolveSetupSelection } from "./setup_selection.mjs";
import { verifyInstalledSetup } from "./setup_verification.mjs";

function reviewerResult(resultPath) {
  const value = fs.readFileSync(resultPath, "utf8");
  if (value.length > 1024 || !value.endsWith("\n")) {
    throw new Error("the named setup app returned a malformed result");
  }
  const [status, ...detail] = value.trimEnd().split("\t");
  if (!new Set(["cancelled", "failed", "installer-closed"]).has(status)) {
    throw new Error("the named setup app closed without a final result");
  }
  return { status, detail: detail.join(" ").replace(/[\r\n]+/g, " ") };
}

function prepareWorkspace(runtime = {}) {
  const makeTemp = runtime.makeTemp || ((prefix) => fs.mkdtempSync(prefix));
  const directory = makeTemp(path.join(os.tmpdir(), "tm-u220-printing-setup-"));
  fs.chmodSync(directory, 0o700);
  return directory;
}

function authorizedCheckMessage(device) {
  if (device.outcome !== "verified") {
    return `Authorized device check did not verify a TM-U220: `
      + `${device.error?.message || device.outcome}.\n`;
  }
  if (device.readiness?.ready === true) {
    return "Authorized device check: TM-U220 verified and ready.\n";
  }
  const detail = device.readiness?.ready === false
    ? device.readiness.reasons.join(", ") : "status unavailable";
  return `Authorized device check: TM-U220 identity verified; readiness ${detail}.\n`;
}

export async function runSetup(argv, services, io = process, runtime = {}) {
  const options = services.parseArguments(argv);
  if (options.help) {
    io.stdout.write(SETUP_USAGE);
    return 0;
  }
  services.assertEnvironment();
  const identity = services.captureIdentity();
  let selection;
  if (argv.length === 0 && services.selectSetup) {
    const assisted = await services.selectSetup({
      host: null, suggestedHost: null, profilePath: null,
    });
    if (assisted.cancelled) {
      io.stdout.write("Setup cancelled: no system change was requested.\n");
      return 0;
    }
    selection = resolveSetupSelection({ ...options,
      host: assisted.host, profilePath: assisted.profilePath }, services);
  } else {
    selection = resolveSetupSelection(options, services);
  }
  const before = services.audit();
  const preflight = services.classifyPreflight(before);
  const recordedAt = (runtime.now || (() => new Date()))().toISOString();
  const evidence = { mode: "deferred", recordedAt,
    reason: "privileged_source_required" };
  io.stdout.write("Printer contact is deferred until the reviewed privileged-source "
    + "authorization has been installed.\n");
  const bundle = services.createPolicy({ identity, host: selection.host,
    profile: selection.profile, probe: evidence });
  const directory = prepareWorkspace(runtime);
  try {
    const packageInfo = services.buildPackage(directory, bundle);
    const reviewer = services.buildReviewer(directory, {
      bundle, packageInfo, preflight, scriptPath: services.reviewerScriptPath,
    });
    services.launchReviewer(reviewer.path);
    const result = reviewerResult(reviewer.resultPath);
    if (result.status === "cancelled") {
      io.stdout.write("Setup cancelled: no system change was requested.\n");
      return 0;
    }
    if (result.status === "failed") {
      throw new Error(result.detail || "the named setup app reported a failure");
    }
    const after = services.audit();
    verifyInstalledSetup(after, bundle, packageInfo);
    io.stdout.write(`Printing policy installed and verified for ${identity.name} (UID ${identity.uid}) `
      + `at ${selection.host}; all ${bundle.sudoers.commands.length} exact commands are active.\n`);
    io.stdout.write("The formatter remains unprivileged; plain 220 commands may now use only "
      + "the reviewed passwordless connection commands.\n");
    if (services.checkDevice) {
      io.stdout.write("Checking the printer through the newly installed privileged-source bypass.\n");
      const device = await services.checkDevice(bundle.manifest);
      io.stdout.write(authorizedCheckMessage(device));
    }
    return 0;
  } finally {
    const remove = runtime.removeTree || ((target) => fs.rmSync(target,
      { recursive: true, force: true }));
    remove(directory);
  }
}

export { reviewerResult };
