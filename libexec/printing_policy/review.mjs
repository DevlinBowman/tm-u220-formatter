// Renders a complete human review from the same byte-exact bundle sent to Apple Installer.
// It explicitly describes transport risk, migration, fingerprints, and reversible removal paths.
import { canonicalPackageContract } from "./package_contract.mjs";
import { artifactPolicy, PACKAGE_ID, printingPolicy } from "./spec.mjs";
import { sha256 } from "./validation.mjs";

function octal(mode) {
  return mode.toString(8).padStart(4, "0");
}

function artifactSummary(label, artifact) {
  return [
    `  ${label}: ${artifact.path}`,
    `    owner/group: ${artifact.uid}:${artifact.gid} (root:wheel after installation)`,
    `    mode: ${octal(artifact.mode)}`,
    `    bytes: ${artifact.byteLength}`,
    `    SHA-256: ${artifact.hash}`,
  ];
}

function evidenceText(probe) {
  if (probe.mode === "verified") {
    return `  Device identity verified at ${probe.recordedAt}: ${probe.model}, model ID ${probe.modelId}.`;
  }
  if (probe.mode === "offline") {
    return `  Device identity was not verified; its probe failed at ${probe.recordedAt}: `
      + `${probe.error}. Explicit acceptance recorded: ${probe.acceptance}.`;
  }
  if (probe.mode === "deferred") {
    return `  Device checking is deferred until after authorization (${probe.reason}); `
      + `recorded at ${probe.recordedAt}.`;
  }
  throw new Error("review received unsupported device evidence");
}

function exactBytes(label, artifact) {
  const displayed = artifact.bytes.toString("utf8").split("\n")
    .map((line) => `  | ${line}`).join("\n");
  return [
    `Exact ${label} bytes (display prefix "  | " is not installed)`,
    "──────────────────────────",
    displayed,
    "──────────────────────────",
    "",
  ];
}

function namedArtifacts(contract) {
  const find = (definition) => contract.artifacts.find((value) => value.path === definition.path);
  return {
    manifest: find(artifactPolicy.manifest),
    profile: find(artifactPolicy.profile),
    sudoers: find(artifactPolicy.sudoers),
    legacyTombstone: find(artifactPolicy.legacyTombstone),
  };
}

function validatePackageInfo(artifacts, packageInfo) {
  if (!packageInfo || packageInfo.identifier !== printingPolicy.package.identifier
      || packageInfo.name !== printingPolicy.package.name || packageInfo.scripts !== false) {
    throw new Error("review package identity or script policy differs from canonical policy");
  }
  if (!Buffer.isBuffer(packageInfo.bytes) || sha256(packageInfo.bytes) !== packageInfo.hash
      || !/^[0-9a-f]{64}$/.test(packageInfo.hash)
      || !/^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){1,5}$/.test(packageInfo.version)) {
    throw new Error("review package fingerprint or version is invalid");
  }
  const expected = Object.values(artifacts).sort((left, right) => left.path < right.path ? -1 : 1);
  const actual = [...(packageInfo.payload || [])].sort((left, right) => left.path < right.path ? -1 : 1);
  if (actual.length !== expected.length || actual.some((value, index) => {
    const wanted = expected[index];
    return value.path !== wanted.path || value.hash !== wanted.hash
      || value.byteLength !== wanted.byteLength || value.mode !== wanted.mode
      || value.uid !== wanted.uid || value.gid !== wanted.gid;
  })) throw new Error("review package payload metadata differs from canonical artifacts");
}

export function reviewText(bundle, packageInfo) {
  if (!bundle?.manifest?.bytes || !bundle?.profile?.bytes || !packageInfo?.version) {
    throw new Error("review requires a canonical policy bundle and completed package information");
  }
  const contract = canonicalPackageContract(bundle, packageInfo.version);
  const { manifest, sudoers } = contract;
  const artifacts = namedArtifacts(contract);
  validatePackageInfo(artifacts, packageInfo);
  const live = manifest.routes.find((route) => route.name === "live");
  const lpd = manifest.routes.find((route) => route.name === "lpd");
  const lines = [
    "TM-U220 PRINTING POLICY — EXACT REVIEW",
    "",
    "Package",
    `  Name: ${packageInfo.name || printingPolicy.package.name}`,
    `  Identifier: ${packageInfo.identifier || PACKAGE_ID}`,
    `  Version: ${packageInfo.version}`,
    "  Signature: unsigned; built locally from the reviewed project",
    "  Scripts: none (no preinstall, postinstall, executable helper, daemon, or service)",
    `  SHA-256: ${packageInfo.hash}`,
    "",
    "Installed artifacts (all existing files at these exact paths are replaced after approval)",
    ...artifactSummary("canonical manifest", artifacts.manifest),
    ...artifactSummary("selected physical profile", artifacts.profile),
    ...artifactSummary("canonical sudoers policy", artifacts.sudoers),
    ...artifactSummary("legacy LPD tombstone", artifacts.legacyTombstone),
    "  Other payload records are only the required root:wheel mode 0755 parent directories.",
    "",
    "Account and device evidence",
    `  Authorized local account: ${manifest.identity.name} (UID ${manifest.identity.uid}).`,
    evidenceText(manifest.probe),
    "  Package installation performs no network I/O; device checking follows authorization.",
    "",
    "Exact capability and security boundary",
    `  ${sudoers.commands.length} fixed /usr/bin/nc command lines may run as root without a password:`,
    `  ${live.sourcePorts.length} connections to ${live.host}:${live.destinationPort}; `
      + `${lpd.sourcePorts.length} connections to ${lpd.host}:${lpd.destinationPort} for queue ${lpd.queue}.`,
    "  The destination IP, destination ports, timeouts, and reserved local source ports are fixed.",
    "  NOEXEC and NOSETENV apply. The application, Node, Lua, Perl, and shells are not elevated.",
    "  IMPORTANT: each authorized nc process accepts arbitrary standard-input bytes. The authorized",
    "  account can therefore send any byte stream—not only formatter output—to those fixed endpoints.",
    "  Both raw port 9100 and LPD port 515 are plaintext, unauthenticated LAN transports. They provide",
    "  no confidentiality, server authentication, or integrity protection against the local network.",
    "",
    "Migration",
    `  ${artifacts.sudoers.path} becomes the single authorization source for raw and LPD routes.`,
    `  ${artifacts.legacyTombstone.path} is replaced with the inert reviewed tombstone shown below,`,
    "  removing any command grant from the older standalone LPD fragment without silently deleting its path.",
    "",
    "Undo (explicit administrator action)",
    `  sudo /bin/rm ${artifacts.sudoers.path}`,
    `  sudo /bin/rm ${artifacts.legacyTombstone.path}`,
    `  sudo /bin/rm ${artifacts.manifest.path}`,
    `  sudo /bin/rm ${artifacts.profile.path}`,
    `  sudo /bin/rmdir ${artifacts.manifest.path.slice(0, artifacts.manifest.path.lastIndexOf("/"))}`,
    "  sudo /usr/sbin/visudo -c",
    `  sudo /usr/sbin/pkgutil --forget ${packageInfo.identifier || PACKAGE_ID}`,
    "",
    ...exactBytes("canonical manifest", artifacts.manifest),
    ...exactBytes("selected printer profile", artifacts.profile),
    ...exactBytes("canonical sudoers policy", artifacts.sudoers),
    ...exactBytes("legacy LPD tombstone", artifacts.legacyTombstone),
  ];
  return lines.join("\n");
}
