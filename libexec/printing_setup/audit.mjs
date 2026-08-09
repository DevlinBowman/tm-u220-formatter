// Orchestrates a read-only audit of the canonical printing policy and effective grants.
// Device I/O is deliberately excluded; the status CLI adds it only on explicit request.
import { auditEnvironment } from "./audit/environment.mjs";
import { inspectFile } from "./audit/files.mjs";
import { auditInvokingAccount } from "./audit/invoking_account.mjs";
import { collectAuditIssues } from "./audit/issues.mjs";
import { auditPathSafety } from "./audit/paths.mjs";
import { auditPackageReceipt } from "./audit/receipt.mjs";
import { auditSudoAuthorization } from "./audit/sudo.mjs";

function artifact(definition, additions, runtime) {
  return inspectFile({ ...definition, ...additions }, runtime);
}

function skippedAuthorization(expected) {
  return {
    queried: false, available: false, exitStatus: null,
    error: "effective sudo inspection is available only on macOS",
    expected, active: [], missing: expected, extra: [], broad: [], extraDetails: [],
    misconfigured: [], exact: false,
  };
}

function skippedReceipt(identifier) {
  return { identifier, reportedIdentifier: null, queried: false, found: false, version: null,
    error: "package receipt inspection is available only on macOS" };
}

function schemaReport(policy, parsed, error) {
  return {
    valid: Boolean(parsed),
    expectedName: policy.schema.name,
    expectedVersion: policy.schema.version,
    version: parsed?.schemaVersion ?? null,
    error: error ? String(error.message || error).slice(0, 240) : null,
  };
}

export function auditPrintingSetup(policyApi, runtime = {}) {
  const policy = policyApi.printingPolicy || policyApi;
  const environment = auditEnvironment(policy, runtime);
  const pathSafety = auditPathSafety(runtime);
  const configurationBlock = pathSafety.artifactParents.configuration.blockedBy;
  const authorizationBlock = pathSafety.artifactParents.authorization.blockedBy;
  const manifestRead = artifact(policy.artifacts.manifest,
    { read: true, blockedBy: configurationBlock }, runtime);
  let manifest = null;
  let parseError = null;
  if (manifestRead.bytes) {
    try { manifest = policyApi.parseManifest(manifestRead.bytes); } catch (error) { parseError = error; }
  }
  manifestRead.report.schema = schemaReport(policy, manifest, parseError);
  const invokingAccount = auditInvokingAccount(manifest?.identity,
    policyApi.captureCurrentIdentity, runtime);

  let rendered = null;
  let tombstone = null;
  let renderError = null;
  try { tombstone = policyApi.renderLegacyTombstone(); } catch (error) { renderError = error; }
  if (manifest) {
    try {
      rendered = policyApi.renderSudoers(manifest);
    } catch (error) { renderError = error; }
  }
  const profileDefinition = policy.artifacts.profile;
  const profileRead = artifact(profileDefinition, {
    path: manifest?.profile.path || profileDefinition.path,
    read: true,
    expectedHash: manifest?.profile.hash,
    expectedSize: manifest?.profile.byteLength,
    blockedBy: configurationBlock,
  }, runtime);
  let parsedProfile = null;
  let profileError = null;
  if (profileRead.bytes) {
    try { parsedProfile = policyApi.parseProfile(profileRead.bytes); }
    catch (error) { profileError = error; }
  }
  profileRead.report.schema = {
    valid: Boolean(parsedProfile),
    error: profileError ? String(profileError.message || profileError).slice(0, 240) : null,
  };
  const sudoersRead = artifact(policy.artifacts.sudoers,
    { read: false, expectedSize: rendered?.byteLength, blockedBy: authorizationBlock }, runtime);
  const legacyRead = artifact(policy.artifacts.legacyTombstone,
    { read: false, expectedSize: tombstone?.byteLength, blockedBy: authorizationBlock }, runtime);
  sudoersRead.report.expected.sha256 = rendered?.hash || null;
  legacyRead.report.expected.sha256 = tombstone?.hash || null;

  const expected = rendered?.commands || [];
  const authorization = environment.platform.supported
    ? auditSudoAuthorization(expected, runtime) : skippedAuthorization(expected);
  const packageReceipt = environment.platform.supported
    ? auditPackageReceipt(policy.package.identifier, runtime)
    : skippedReceipt(policy.package.identifier);
  const live = manifest?.routes.find((route) => route.name === "live") || null;
  const parts = {
    environment, pathSafety, invokingAccount,
    artifacts: {
      manifest: manifestRead.report, profile: profileRead.report,
      sudoers: sudoersRead.report, legacyTombstone: legacyRead.report,
    },
    packageReceipt,
    authorization,
    renderError,
  };
  const issues = collectAuditIssues(parts);
  return {
    kind: "tm-u220-printing-status", schemaVersion: 1,
    localOnly: true, healthy: issues.length === 0,
    environment, pathSafety, invokingAccount,
    configuration: manifest ? {
      account: manifest.identity,
      endpoint: live ? { host: live.host, port: live.destinationPort } : null,
      profilePath: manifest.profile.path,
      probeEvidence: manifest.probe,
    } : null,
    artifacts: parts.artifacts,
    packageReceipt,
    authorization,
    device: null,
    issues,
  };
}
