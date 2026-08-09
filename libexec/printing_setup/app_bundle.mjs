// Builds the named macOS reviewer app around the exact canonical bundle and package.
// Its generated resources are the sole source of machine-specific review language.
import { spawnSync as nodeSpawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { reviewText, sha256 } from "../printing_policy/index.mjs";

function run(executable, args, runtime = {}) {
  const spawnSync = runtime.spawnSync || nodeSpawnSync;
  const result = spawnSync(executable, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(detail || `${path.basename(executable)} exited ${result.status}`);
  }
  return result;
}

function writeResource(resources, name, value, mode = 0o400) {
  const target = path.join(resources, name);
  fs.writeFileSync(target, value, { flag: "wx", mode });
  fs.chmodSync(target, mode);
  return target;
}

function stateLead(preflight) {
  if (preflight.state === "fresh") return "No managed printing policy is installed.";
  if (preflight.state === "uninspected") {
    return "The current effective sudo permission list was unavailable. Apple Installer will "
      + "replace the managed TM-U220 policy files; unrelated sudo policy could not be ruled out.";
  }
  if (preflight.state === "legacy") {
    return `A recognized ${preflight.legacyCommands}-command legacy policy for `
      + `${preflight.legacyHost} will be migrated${preflight.stale1022
        ? ", including removal of its stale source-port 1022 grant" : ""}.`;
  }
  if (preflight.state === "active") {
    return "A complete canonical policy is active and will be explicitly reinstalled.";
  }
  return "An incomplete canonical policy will be explicitly repaired and replaced.";
}

function summary(bundle, packageInfo, preflight) {
  const live = bundle.manifest.routes.find((route) => route.name === "live");
  const lpd = bundle.manifest.routes.find((route) => route.name === "lpd");
  let evidence;
  if (bundle.manifest.probe.mode === "verified") {
    evidence = "A prior authorized check verified TM-U220 model name and model ID 13.";
  } else if (bundle.manifest.probe.mode === "deferred") {
    evidence = "No pre-authorization connection was attempted because this printer requires "
      + "a privileged local source port. Device checking follows installation.";
  } else {
    evidence = `A prior device check failed (${bundle.manifest.probe.error}); `
      + "the operator explicitly accepted offline setup.";
  }
  return `${stateLead(preflight)}\n\n`
    + `Apple Installer will replace four disclosed root-owned, read-only files for account `
    + `${bundle.identity.name} (UID ${bundle.identity.uid}). The resulting ${bundle.sudoers.commands.length} `
    + `passwordless commands are limited to /usr/bin/nc connections to ${live.host}:9100 and `
    + `${lpd.host}:515 from fixed reserved source ports. NOEXEC and NOSETENV apply; no shell, `
    + "application runtime, daemon, or helper is elevated.\n\n"
    + `${evidence} Installation itself performs no network I/O and cannot print.\n\n`
    + "Security boundary: each allowed netcat process can receive arbitrary standard-input bytes, "
    + "and both printer protocols are plaintext and unauthenticated on the local network.\n\n"
    + `The locally built ${packageInfo.name} is unsigned and script-free. You must open the exact `
    + "byte-level review before Apple Installer can be launched. The terminal performs an independent "
    + "post-install audit of every artifact, receipt, and effective command.";
}

export function buildReviewerApp(directory, assets, runtime = {}) {
  const { bundle, packageInfo, preflight } = assets;
  const appPath = path.join(directory, "TM-U220 Printing Setup.app");
  run("/usr/bin/osacompile", [
    "-l", "JavaScript", "-o", appPath, assets.scriptPath,
  ], runtime);
  const infoPath = path.join(appPath, "Contents", "Info.plist");
  for (const [key, value] of [
    ["CFBundleName", "TM-U220 Printing Setup"],
    ["CFBundleDisplayName", "TM-U220 Printing Setup"],
  ]) {
    run("/usr/bin/plutil", ["-replace", key, "-string", value, infoPath], runtime);
  }

  const resources = path.join(appPath, "Contents", "Resources");
  const embeddedPackage = path.join(resources, packageInfo.name);
  writeResource(resources, packageInfo.name, packageInfo.bytes);
  if (sha256(fs.readFileSync(embeddedPackage)) !== packageInfo.hash) {
    throw new Error("embedded reviewer package differs from the validated package");
  }
  writeResource(resources, "TM-U220 Policy Review.txt", reviewText(bundle, packageInfo));
  writeResource(resources, "package-name", `${packageInfo.name}\n`);
  writeResource(resources, "package-sha256", `${packageInfo.hash}\n`);
  writeResource(resources, "review-summary", `${summary(bundle, packageInfo, preflight)}\n`);
  writeResource(resources, "setup-state", `${preflight.state}\n`);
  const resultPath = writeResource(directory, "setup-result", "pending\n", 0o600);
  run("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", appPath], runtime);
  run("/usr/bin/codesign", ["--verify", "--strict", appPath], runtime);
  return Object.freeze({ path: appPath, resultPath,
    reviewPath: path.join(resources, "TM-U220 Policy Review.txt") });
}

export function launchReviewer(appPath, runtime = {}) {
  run("/usr/bin/codesign", ["--verify", "--strict", appPath], runtime);
  run("/usr/bin/open", ["-W", "-n", appPath], runtime);
}
