// Renders the only privileged command surface and the inert legacy migration marker.
// Rendering reparses canonical manifest bytes so callers cannot inject mutable command fields.
import { parseManifest } from "./manifest.mjs";
import { validatePrinterIPv4 } from "./ipv4.mjs";
import { FIXED_ROUTE_SPECS } from "./spec.mjs";
import { freezePolicy, immutableByteRecord, sha256 } from "./validation.mjs";

const TOMBSTONE_TEXT = [
  "# TM-U220 legacy LPD authorization tombstone.",
  "# LPD access is managed by tm-u220-live-raw; this file intentionally grants no commands.",
  "",
].join("\n");

function canonicalManifest(value) {
  if (Buffer.isBuffer(value)) return parseManifest(value);
  if (!value || !Buffer.isBuffer(value.bytes)) throw new Error("a canonical printing manifest is required");
  return parseManifest(value.bytes);
}

export function commandText(route, sourcePort) {
  const spec = FIXED_ROUTE_SPECS.find((value) => value.name === route?.name);
  validatePrinterIPv4(route?.host);
  if (!spec || route.destinationPort !== spec.destinationPort
      || route.timeoutSeconds !== spec.timeoutSeconds
      || route.sourcePorts.length !== spec.sourcePorts.length
      || route.sourcePorts.some((value, index) => value !== spec.sourcePorts[index])
      || !route.sourcePorts.includes(sourcePort)) {
    throw new Error("command route is not the canonical manifest-bound fixed route");
  }
  return `/usr/bin/nc -w ${route.timeoutSeconds} -p ${sourcePort} ${route.host} `
    + `${route.destinationPort}`;
}

export function renderSudoers(value) {
  const manifest = canonicalManifest(value);
  const commands = manifest.routes.flatMap((route) => route.sourcePorts
    .map((sourcePort) => commandText(route, sourcePort)));
  const text = commands.map((command) => `#${manifest.identity.uid} ALL=(root) `
    + `NOPASSWD:NOEXEC:NOSETENV: ${command}`).join("\n") + "\n";
  const bytes = Buffer.from(text, "utf8");
  return immutableByteRecord(bytes, { hash: sha256(bytes), byteLength: bytes.length,
    commands: [...commands], identity: manifest.identity, routes: manifest.routes });
}

export function renderLegacyTombstone() {
  const bytes = Buffer.from(TOMBSTONE_TEXT, "utf8");
  return immutableByteRecord(bytes, { hash: sha256(bytes), byteLength: bytes.length });
}
