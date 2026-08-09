// Resolves setup choices, reusing an installed canonical choice only when one exists.
// Missing first-time choices are handed to the native assistant; all selections are validated here.
import { SetupUsageError } from "./setup_arguments.mjs";
import { loadProfileReference } from "./profile_reference.mjs";

export class SetupSelectionRequired extends SetupUsageError {}

function installedFallback(loadInstalledPolicy) {
  try { return loadInstalledPolicy(); } catch { return null; }
}

export function resolveSetupSelection(options, services) {
  const needsInstalled = !options.host || !options.profilePath;
  const installed = needsInstalled ? installedFallback(services.loadInstalledPolicy) : null;
  let host = options.host || installed?.manifest?.host || null;
  let loadedProfile = null;
  if (options.profilePath) {
    loadedProfile = loadProfileReference(options.profilePath, services);
  }
  const profile = loadedProfile?.profile || installed?.profile || null;
  if (!host || !profile) {
    const missing = [!host && "--host IPV4", !profile && "--profile FILE"].filter(Boolean);
    throw new SetupSelectionRequired(
      `setup requires ${missing.join(" and ")}`,
    );
  }
  try { host = services.validateHost(host); } catch (error) {
    throw new SetupUsageError(error.message);
  }
  return Object.freeze({ host, profile,
    profileSource: loadedProfile?.path || "installed profile" });
}
