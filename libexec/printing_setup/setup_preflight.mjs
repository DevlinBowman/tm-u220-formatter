// Classifies fresh, canonical, and narrowly recognized legacy authorization before replacement.
// Unknown paths, metadata, weak grants, and unrelated passwordless netcat rules fail closed.
import { validatePrinterIPv4 } from "../printing_policy/index.mjs";

const LIVE_PORTS = Object.freeze([1023, 1021, 1020, 1019, 1018, 1017, 1016, 1015]);
const LPD_PORTS = Object.freeze([731, 730, 729, 728, 727, 726, 725, 724, 723, 722, 721]);

function fail(message) {
  throw new Error(`existing printing authorization requires manual review: ${message}`);
}

function existingArtifacts(report) {
  return Object.entries(report.artifacts).filter(([, value]) => value.exists === true);
}

function secureExistingArtifacts(report) {
  const hasManifest = report.artifacts.manifest.exists === true;
  for (const [name, value] of Object.entries(report.artifacts)) {
    if (value.exists !== true && value.exists !== false) {
      fail(`${name} at ${value.path} could not be inspected`);
    }
  }
  for (const [name, value] of existingArtifacts(report)) {
    const expectedMode = value.expected.mode;
    const baseline = value.type === "regular_file" && value.uid === 0 && value.gid === 0
      && value.links === 1 && value.mode === expectedMode && value.size > 0 && value.size <= 8192;
    if (!baseline || (hasManifest && !value.metadataValid)) {
      fail(`${name} at ${value.path} has unexpected type or metadata`);
    }
  }
  if (report.artifacts.manifest.exists && !report.artifacts.manifest.schema.valid) {
    fail("the installed manifest is not canonical");
  }
}

function parseLegacyCommand(command) {
  const match = command.match(
    /^\/usr\/bin\/nc -w (5|30) -p ([0-9]{1,5}) ((?:[0-9]{1,3}\.){3}[0-9]{1,3}) (515|9100)$/,
  );
  if (!match) return null;
  const [, timeoutText, sourceText, host, destinationText] = match;
  try { validatePrinterIPv4(host); } catch { return null; }
  return { timeout: Number(timeoutText), source: Number(sourceText), host,
    destination: Number(destinationText) };
}

function legacyShape(commands, details) {
  if (commands.length === 0) return null;
  const values = commands.map(parseLegacyCommand);
  if (values.some((value) => !value)) return null;
  if (details.length !== commands.length
      || details.some((value) => !value.rootOnly || !value.nopasswd
        || !value.noexec || !value.nosetenv)) return null;
  const hosts = new Set(values.map((value) => value.host));
  if (hosts.size !== 1) return null;
  const host = values[0].host;
  const actual = new Set(values.map((value) => `${value.timeout}:${value.source}:${value.destination}`));
  const live = LIVE_PORTS.map((source) => `30:${source}:9100`);
  const lpd = LPD_PORTS.map((source) => `5:${source}:515`);
  const permittedSets = [live, [...live, ...lpd], [...live, ...lpd, "5:1022:515"]];
  const recognized = permittedSets.some((expected) => expected.length === actual.size
    && expected.every((value) => actual.has(value)));
  return recognized ? { host, commandCount: actual.size,
    stale1022: actual.has("5:1022:515") } : null;
}

function allowedCanonicalExtras(report) {
  const extras = report.authorization.extra;
  if (extras.length === 0) return { stale1022: false };
  const host = report.configuration?.endpoint?.host;
  const expected = host ? `/usr/bin/nc -w 5 -p 1022 ${host} 515` : null;
  const detail = report.authorization.extraDetails.find((value) => value.command === expected);
  if (extras.length === 1 && extras[0] === expected && detail?.rootOnly && detail?.nopasswd
      && detail?.noexec && detail?.nosetenv) {
    return { stale1022: true };
  }
  fail(`${extras.length} unrecognized passwordless netcat command(s) are active`);
}

export function classifySetupPreflight(report) {
  if (!report?.environment?.platform?.supported) fail("the host platform is unsupported");
  if (!report.pathSafety?.safe) {
    fail("a canonical parent directory is unsafe or contains unmanaged entries");
  }
  secureExistingArtifacts(report);
  if (!report.authorization.available) {
    const manifestExists = report.artifacts.manifest.exists === true;
    const profileExists = report.artifacts.profile.exists === true;
    if (profileExists && !manifestExists) {
      fail("an installed profile exists without a canonical manifest");
    }
    return Object.freeze({ state: manifestExists ? "repair" : "uninspected",
      legacyHost: null, stale1022: false, authorizationUninspected: true });
  }
  if ((report.authorization.broad || []).length > 0) {
    fail("a broad passwordless root or netcat grant is active");
  }
  if (report.authorization.misconfigured.length > 0) {
    fail("an expected netcat grant lacks NOEXEC, NOSETENV, NOPASSWD, or root-only scope");
  }
  const manifestExists = report.artifacts.manifest.exists === true;
  const profileExists = report.artifacts.profile.exists === true;
  if (manifestExists) {
    const extra = allowedCanonicalExtras(report);
    return Object.freeze({ state: report.healthy ? "active" : "repair",
      legacyHost: null, stale1022: extra.stale1022 });
  }
  if (profileExists) fail("an installed profile exists without a canonical manifest");

  const privilegedPaths = [report.artifacts.sudoers, report.artifacts.legacyTombstone]
    .some((value) => value.exists === true);
  const legacy = legacyShape(report.authorization.extra, report.authorization.extraDetails);
  if (!privilegedPaths && report.authorization.extra.length === 0) {
    return Object.freeze({ state: "fresh", legacyHost: null, stale1022: false });
  }
  if (!privilegedPaths || !legacy) {
    fail("the machine does not match a recognized TM-U220 legacy policy");
  }
  return Object.freeze({ state: "legacy", legacyHost: legacy.host,
    stale1022: legacy.stale1022, legacyCommands: legacy.commandCount });
}
