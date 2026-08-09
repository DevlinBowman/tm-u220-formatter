// Presents the canonical local audit and gates authorized printer contact behind --check-device.
// Device checking reuses the installed bypass and never opens an ordinary connection.

const HELP = `Usage: tm-u220-printing-status [--json] [--check-device]\n\n`
  + "By default this inspects only local files, receipts, dependencies, and effective sudo rules.\n"
  + "It never asks for authorization or changes machine state.\n"
  + "--check-device uses the installed privileged-source bypass for Epson identity/status queries.\n"
  + "--json emits the stable tm-u220-printing-status schema version 1.\n";

export function parseStatusArguments(argv) {
  const options = { json: false, checkDevice: false, help: false };
  for (const value of argv) {
    if (value === "--json") options.json = true;
    else if (value === "--check-device") options.checkDevice = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`unknown option: ${value}`);
  }
  return options;
}

function markDevice(report, device) {
  const issues = [...report.issues];
  if (device.outcome !== "verified") {
    issues.push({ code: "DEVICE_CHECK_FAILED", severity: "error",
      message: device.error?.message || "device identity could not be verified" });
  } else if (device.readiness.checked && device.readiness.ready === null) {
    issues.push({ code: "DEVICE_READINESS_UNAVAILABLE", severity: "error",
      message: device.error?.message || "printer identity is verified, but readiness is unavailable" });
  } else if (device.readiness.checked && !device.readiness.ready) {
    issues.push({ code: "DEVICE_NOT_READY", severity: "error",
      message: `printer is not ready: ${device.readiness.reasons.join(", ")}` });
  }
  return { ...report, localOnly: device.checked !== true,
    healthy: issues.length === 0, device, issues };
}

function unavailableDevice() {
  return {
    schemaVersion: 1, checked: false, outcome: "unavailable", endpoint: null,
    identity: { verified: false, modelName: null, modelId: null },
    readiness: { checked: false, ready: null, reasons: [], statuses: null },
    error: { code: "DEVICE_ENDPOINT_UNAVAILABLE",
      message: "a valid installed manifest is required before checking the device" },
  };
}

function artifactLines(label, value) {
  let state = "attention";
  if (value.exists && value.metadataValid) {
    if (label === "manifest" && value.schema?.valid) state = "valid";
    else if (label === "profile" && value.hashMatches === true) state = "hash matches";
    else if (value.expected?.size !== null) state = "metadata matches";
  }
  const lines = [`  ${label}: ${state}`, `    path: ${value.path}`];
  if (value.exists) {
    lines.push(`    actual: type=${value.type} links=${value.links} uid=${value.uid} gid=${value.gid} `
      + `mode=${value.mode} size=${value.size} readable=${value.readable}`);
  } else {
    lines.push(`    actual: ${value.exists === false ? "absent" : "inspection failed"}`);
  }
  const expected = value.expected || {};
  lines.push(`    expected: type=regular_file uid=${expected.uid} gid=${expected.gid} `
    + `mode=${expected.mode} size=${expected.size ?? "manifest-defined"}`);
  if (value.sha256) lines.push(`    sha256: ${value.sha256}`);
  if (expected.sha256) lines.push(`    expected sha256: ${expected.sha256}`);
  if (value.schema) {
    lines.push(`    schema: ${value.schema.valid ? "valid" : "invalid"}`
      + `${value.schema.error ? ` (${value.schema.error})` : ""}`);
  }
  if (value.error) lines.push(`    inspection error: ${value.error.message}`);
  return lines;
}

function evidenceText(evidence) {
  if (!evidence) return "unavailable";
  if (evidence.mode === "offline") {
    return `legacy offline evidence at ${evidence.recordedAt} (${evidence.error})`;
  }
  if (evidence.mode === "deferred") {
    return `deferred at ${evidence.recordedAt} (${evidence.reason})`;
  }
  return `${evidence.mode} at ${evidence.recordedAt}`;
}

function pathSafetyLines(value) {
  if (!value) return [];
  const names = (values) => values.map((name) => JSON.stringify(name)).join(", ") || "none";
  const lines = [`Canonical path safety: ${value.safe ? "safe" : "attention needed"}`];
  for (const directory of value.directories) {
    let actual = `not traversed (blocked by ${directory.blockedBy})`;
    if (directory.checked && directory.exists === true) {
      actual = `${directory.type} uid=${directory.uid} gid=${directory.gid} mode=${directory.mode}`;
    } else if (directory.checked && directory.exists === false) {
      actual = directory.required ? "absent (required)" : "absent (safe before installation)";
    } else if (directory.checked) {
      actual = `inspection failed${directory.error ? ` (${directory.error})` : ""}`;
    }
    lines.push(`  ${directory.path}: ${actual}`);
  }
  const entries = value.managedEntries;
  if (entries.checked) {
    lines.push(`  managed entries: ${names(entries.actual)}`,
      `  entry set: ${entries.exact ? "exact" : `missing=${names(entries.missing)} `
        + `unknown=${names(entries.unknown)}`}`);
  }
  return lines;
}

export function renderHumanStatus(report) {
  const dependencies = report.environment.dependencies || [];
  const availableDependencies = dependencies.filter((value) =>
    value.exists && value.regularFile && value.executable).length;
  const evidence = report.configuration?.probeEvidence;
  const lines = [
    `TM-U220 printing status: ${report.healthy ? "READY" : "ATTENTION NEEDED"}`,
    `Printer contacted: ${report.localOnly ? "no" : "yes (installed bypass; explicit --check-device)"}`,
    "Authorization requested: no (effective rules are listed with sudo -n -ll)",
    `Platform: ${report.environment.platform.actual} `
      + `(${report.environment.platform.supported ? "supported" : "unsupported"})`,
    ...(report.invokingAccount ? [`Invoking account: ${report.invokingAccount.available
      ? `${report.invokingAccount.name} (UID ${report.invokingAccount.uid})`
      : `unavailable (${report.invokingAccount.error})`}; installed match: ${
        report.invokingAccount.matchesInstalled === null ? "not applicable"
          : report.invokingAccount.matchesInstalled ? "yes" : "no"}`] : []),
    `Dependencies: ${availableDependencies}/${dependencies.length} available`,
    ...pathSafetyLines(report.pathSafety),
    "Installed artifacts:",
    ...artifactLines("manifest", report.artifacts.manifest),
    ...artifactLines("profile", report.artifacts.profile),
    ...artifactLines("sudoers policy", report.artifacts.sudoers),
    ...artifactLines("legacy tombstone", report.artifacts.legacyTombstone),
    `Package receipt (${report.packageReceipt.identifier || "unknown ID"}): ${report.packageReceipt.found
      ? `present (version ${report.packageReceipt.version || "unknown"})` : "absent"}`,
    ...(report.packageReceipt.error ? [`  receipt detail: ${report.packageReceipt.error}`] : []),
    `Installed device evidence: ${evidenceText(evidence)}`,
    "Effective netcat authorization (root, NOPASSWD, NOEXEC, NOSETENV required):",
    `  expected=${report.authorization.expected.length} active=${report.authorization.active.length} `
      + `missing=${report.authorization.missing.length} extra=${report.authorization.extra.length}`,
  ];
  if (report.authorization.broad?.length) {
    lines.push("  Broad grants affecting netcat:",
      ...report.authorization.broad.map((value) => `    ${value}`));
  }
  if (report.authorization.missing.length) {
    lines.push("  Missing commands:",
      ...report.authorization.missing.map((value) => `    ${value}`));
  }
  if (report.authorization.misconfigured?.length) {
    lines.push("  Weak command grants:", ...report.authorization.misconfigured.map((value) =>
      `    ${value.command} [root=${value.runAsRoot} nopasswd=${value.nopasswd} `
        + `noexec=${value.noexec} nosetenv=${value.nosetenv}]`));
  }
  if (report.authorization.extra.length) {
    lines.push("  Extra commands:", ...report.authorization.extra.map((value) => `    ${value}`));
  }
  if (report.authorization.error) lines.push(`  Listing error: ${report.authorization.error}`);
  if (report.device) {
    lines.push(`Device check: ${report.device.outcome}`);
    if (report.device.identity?.verified) lines.push("  identity: TM-U220 (model ID 13)");
    if (report.device.readiness?.checked) {
      const nearEnd = report.device.readiness.statuses?.paper?.nearEnd;
      let readiness;
      if (report.device.readiness.ready === null) {
        readiness = `unavailable (${report.device.error?.message || "status response unavailable"})`;
      } else if (report.device.readiness.ready) {
        readiness = `ready${nearEnd ? " (paper near end)" : ""}`;
      } else {
        readiness = `not ready (${report.device.readiness.reasons.join(", ")})`;
      }
      lines.push(`  readiness: ${readiness}`);
    }
  } else {
    lines.push("Device check: not requested (use --check-device to contact the configured address)");
  }
  if (report.issues.length) {
    lines.push("Issues:", ...report.issues.map((value) => `  ${value.code}: ${value.message}`));
  }
  return `${lines.join("\n")}\n`;
}

export async function runStatus(argv, services, io = process) {
  let options;
  try { options = parseStatusArguments(argv); } catch (error) {
    io.stderr.write(`${error.message}\n${HELP}`);
    return 64;
  }
  if (options.help) {
    io.stdout.write(HELP);
    return 0;
  }
  let report = await services.audit();
  if (options.checkDevice) {
    const endpoint = report.configuration?.endpoint;
    const device = endpoint ? await services.probe(endpoint) : unavailableDevice();
    report = markDevice(report, device);
  }
  io.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderHumanStatus(report));
  return report.healthy ? 0 : 1;
}
