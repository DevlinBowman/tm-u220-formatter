// Assembles one canonical manifest, selected profile, sudoers rule, and migration tombstone.
// Every package and review consumer receives the same byte-bearing policy bundle.
import { createManifest, loadInstalledPolicy } from "./manifest.mjs";
import { parseProfile } from "./profile.mjs";
import { artifactPolicy } from "./spec.mjs";
import { renderLegacyTombstone, renderSudoers } from "./sudoers.mjs";
import { freezePolicy, immutableByteRecord } from "./validation.mjs";

function artifact(definition, content) {
  return immutableByteRecord(content.bytes, {
    path: definition.path, uid: definition.uid, gid: definition.gid, mode: definition.mode,
    hash: content.hash, byteLength: content.byteLength ?? content.bytes.length,
  });
}

export function createPrintingPolicy({ identity, host, profile: profileValue, probe }) {
  const profile = parseProfile(profileValue?.bytes ?? profileValue);
  const manifest = createManifest({ identity, host, profile, probe });
  const sudoers = renderSudoers(manifest);
  const legacyTombstone = renderLegacyTombstone();
  return freezePolicy({
    manifest,
    profile,
    sudoers,
    legacyTombstone,
    identity: manifest.identity,
    routes: manifest.routes,
    artifacts: {
      manifest: artifact(artifactPolicy.manifest, manifest),
      profile: artifact(artifactPolicy.profile, profile),
      sudoers: artifact(artifactPolicy.sudoers, sudoers),
      legacyTombstone: artifact(artifactPolicy.legacyTombstone, legacyTombstone),
    },
  });
}

export function loadInstalledPrintingPolicy(runtime = {}) {
  const { manifest, profile } = loadInstalledPolicy(runtime);
  return createPrintingPolicy({
    identity: manifest.identity, host: manifest.host, profile, probe: manifest.probe,
  });
}
