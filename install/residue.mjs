// Detects every reserved artifact from an interrupted quarantine removal so it cannot be orphaned.
import fs from "node:fs";
import path from "node:path";
import { existingKind } from "./layout.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const LIBRARY_PATTERN = new RegExp(`^\\.tm-u220-removing-(${UUID})$`);
const BIN_PATTERNS = [new RegExp(`^\\.220-removing-(${UUID})$`),
  new RegExp(`^\\.tm-u220-install-removing-(${UUID})$`)];

function matches(directory, patterns, runtime) {
  if (existingKind(directory, runtime) !== "directory") return [];
  const found = [];
  for (const name of runtime.readdirSync(directory).sort()) {
    const pattern = patterns.find((candidate) => candidate.test(name));
    if (!pattern) continue;
    const target = path.join(directory, name);
    found.push({ path: target, name, nonce: name.match(pattern)[1],
      kind: existingKind(target, runtime) });
  }
  return found;
}

export function inspectRemovalResidues(layout, runtime = fs) {
  const entries = [
    ...matches(layout.library, [LIBRARY_PATTERN], runtime),
    ...matches(layout.bin, BIN_PATTERNS, runtime),
  ];
  const paths = entries.map((entry) => entry.path).sort();
  return { present: entries.length > 0, entries, paths,
    remediation: paths.length === 0 ? null
      : "Manual recovery required: do not reinstall; inspect the listed quarantine, remove only "
        + "the listed reserved backup links, and clear all listed residues before retrying." };
}

export function assertNoRemovalResidues(layout, runtime = fs) {
  const report = inspectRemovalResidues(layout, runtime);
  if (report.present) {
    throw new Error(`incomplete prior uninstall blocks installation: ${report.paths.join(", ")}. `
      + report.remediation);
  }
  return report;
}
