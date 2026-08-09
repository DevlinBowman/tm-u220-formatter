// Deletes only a freshly re-verified release, walking its manifest paths instead of a broad tree.
import fs from "node:fs";
import path from "node:path";
import { inspectRelease } from "./inspect.mjs";
import { MANIFEST_NAME } from "./manifest.mjs";

export function payloadDirectories(payload) {
  const found = new Set();
  for (const entry of payload) {
    let current = path.posix.dirname(entry.path);
    while (current !== ".") {
      found.add(current);
      current = path.posix.dirname(current);
    }
  }
  return [...found].sort((left, right) => right.split("/").length - left.split("/").length
    || right.localeCompare(left));
}

export function removeVerifiedRelease(releaseRoot, runtime = fs) {
  const checked = inspectRelease(releaseRoot, runtime);
  if (!checked.healthy) throw new Error(`release changed before removal: ${checked.issues.join("; ")}`);
  for (const entry of checked.manifest.payload) {
    runtime.unlinkSync(path.join(releaseRoot, ...entry.path.split("/")));
  }
  runtime.unlinkSync(path.join(releaseRoot, MANIFEST_NAME));
  for (const directory of payloadDirectories(checked.manifest.payload)) {
    runtime.rmdirSync(path.join(releaseRoot, ...directory.split("/")));
  }
  runtime.rmdirSync(releaseRoot);
}
