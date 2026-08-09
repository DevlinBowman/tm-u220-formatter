// Resolves setup profile references against the running application release, not the shell directory.
// Custom relative paths remain explicit and are anchored to the captured invocation directory.
import path from "node:path";
import { SetupUsageError } from "./setup_arguments.mjs";

export const DEFAULT_PROFILE_REFERENCE = "default";
export const LEGACY_BUNDLED_PROFILE_REFERENCE = "config/printers/local.u220p";

export function bundledProfilePath(applicationRoot) {
  if (!path.isAbsolute(applicationRoot)) {
    throw new Error("the TM-U220 application root must be absolute");
  }
  return path.join(applicationRoot, "config", "printers", "local.u220p");
}

export function resolveProfileReference(reference, context = {}) {
  if (typeof reference !== "string" || reference.length === 0 || reference.includes("\0")) {
    throw new SetupUsageError("--profile must name a printer profile");
  }
  if (reference === DEFAULT_PROFILE_REFERENCE
      || reference === LEGACY_BUNDLED_PROFILE_REFERENCE) {
    return bundledProfilePath(context.applicationRoot);
  }
  if (path.isAbsolute(reference)) return path.normalize(reference);
  return path.resolve(context.cwd || process.cwd(), reference);
}

export function loadProfileReference(reference, services) {
  const resolved = services.resolveProfileReference(reference);
  try {
    return Object.freeze({ path: resolved, profile: services.loadSelectedProfile(resolved) });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    throw new SetupUsageError(`printer profile was not found at ${resolved}; `
      + "use --profile default for the included profile or pass an existing .u220p file");
  }
}
