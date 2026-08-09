// Converts a canonical policy bundle into the exact four-file macOS package contract.
// Package metadata and payload paths are fixed; only reviewed policy bytes and version vary.
import { parseManifest } from "./manifest.mjs";
import { parseProfile } from "./profile.mjs";
import { artifactPolicy, PACKAGE_ID, PACKAGE_NAME } from "./spec.mjs";
import { renderLegacyTombstone, renderSudoers } from "./sudoers.mjs";
import { freezePolicy, immutableByteRecord } from "./validation.mjs";

function payloadArtifact(definition, content) {
  return immutableByteRecord(content.bytes, {
    path: definition.path,
    relativePath: `.${definition.path}`,
    mode: definition.mode,
    uid: definition.uid,
    gid: definition.gid,
    hash: content.hash,
    byteLength: content.byteLength ?? content.bytes.length,
  });
}

export function validatePackageVersion(value) {
  if (typeof value !== "string" || value.length > 80
      || !/^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){1,5}$/.test(value)) {
    throw new Error("package version must contain two to six canonical numeric components");
  }
  return value;
}

export function defaultPackageVersion(manifest, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("package build time must be a valid date");
  }
  const canonical = Buffer.isBuffer(manifest)
    ? parseManifest(manifest) : parseManifest(manifest?.bytes);
  const iso = now.toISOString();
  const date = iso.slice(0, 10).replaceAll("-", "");
  const time = iso.slice(11, 19).replaceAll(":", "");
  const fingerprint = Number.parseInt(canonical.hash.slice(0, 8), 16);
  return validatePackageVersion(`1.${date}.${time}.${fingerprint}`);
}

export function canonicalPackageContract(bundle, versionValue) {
  if (!bundle?.manifest?.bytes || !bundle?.profile?.bytes) {
    throw new Error("package build requires a canonical printing-policy bundle");
  }
  const manifest = parseManifest(bundle.manifest.bytes);
  const profile = parseProfile(bundle.profile.bytes);
  if (profile.hash !== manifest.profile.hash || profile.byteLength !== manifest.profile.byteLength) {
    throw new Error("selected profile bytes do not match the canonical manifest");
  }
  const sudoers = renderSudoers(manifest);
  const legacyTombstone = renderLegacyTombstone();
  const artifacts = [
    payloadArtifact(artifactPolicy.manifest, manifest),
    payloadArtifact(artifactPolicy.profile, profile),
    payloadArtifact(artifactPolicy.sudoers, sudoers),
    payloadArtifact(artifactPolicy.legacyTombstone, legacyTombstone),
  ].sort((left, right) => left.relativePath < right.relativePath ? -1
    : left.relativePath > right.relativePath ? 1 : 0);
  const directoryPaths = new Set(["."]);
  for (const artifact of artifacts) {
    let current = artifact.relativePath;
    while (current.includes("/")) {
      current = current.slice(0, current.lastIndexOf("/"));
      directoryPaths.add(current);
    }
  }
  const payloadPaths = [...directoryPaths, ...artifacts.map((value) => value.relativePath)]
    .sort((left, right) => left === "." ? -1 : right === "." ? 1
      : left < right ? -1 : left > right ? 1 : 0);
  return freezePolicy({
    identifier: PACKAGE_ID,
    name: PACKAGE_NAME,
    version: validatePackageVersion(versionValue),
    scripts: false,
    manifest,
    profile,
    sudoers,
    legacyTombstone,
    artifacts,
    payloadPaths,
  });
}

export function packageInfoBytes(contract) {
  const byteCount = contract.artifacts.reduce((total, value) => total + value.byteLength, 0);
  const text = `<?xml version="1.0" encoding="utf-8"?>\n`
    + `<pkg-info overwrite-permissions="true" relocatable="false" `
    + `identifier="${contract.identifier}" postinstall-action="none" `
    + `version="${contract.version}" format-version="2" install-location="/" auth="root">\n`
    + `  <payload numberOfFiles="${contract.payloadPaths.length}" `
    + `installKBytes="${Math.max(1, Math.ceil(byteCount / 1024))}"/>\n`
    + `</pkg-info>\n`;
  return Buffer.from(text, "utf8");
}
