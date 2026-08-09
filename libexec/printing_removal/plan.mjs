// Builds a removal plan exclusively from canonical artifact metadata and audited effective grants.
// Every privileged executable and argument is fixed before any administrator prompt occurs.
import path from "node:path";

export const SECURITY_RESIDUALS = Object.freeze([
  "The unprivileged application remains installed; this removes only machine printing policy.",
  "Advanced explicit raw TCP remains available without privileged source ports.",
  "Bytes previously sent to the printer or network cannot be recalled.",
  "Unrelated sudoers rules, package receipts, accounts, and network configuration are untouched.",
]);

function sudoOperation(id, command, argumentsValue, purpose) {
  return Object.freeze({ id, executable: "/usr/bin/sudo",
    arguments: Object.freeze(["--", command, ...argumentsValue]), purpose });
}

function applicationDirectory(policy) {
  return path.posix.dirname(policy.artifacts.manifest.path);
}

function artifactRecord(name, definition, report) {
  const observed = report.artifacts[name];
  if (!observed || observed.path !== definition.path) {
    throw new Error(`audit path for ${name} differs from canonical policy`);
  }
  return Object.freeze({ name, path: definition.path,
    present: observed.exists === true, action: observed.exists === true ? "remove" : "already_absent" });
}

export function createRemovalPlan(report, classification, policy) {
  const order = ["sudoers", "legacyTombstone", "manifest", "profile"];
  const artifacts = order.map((name) => artifactRecord(name, policy.artifacts[name], report));
  const revokedCommands = classification.state === "canonical"
    ? [...report.authorization.active] : [...report.authorization.extra];
  if (revokedCommands.length !== classification.commandCount) {
    throw new Error("audited command count changed while building the removal plan");
  }
  const operations = artifacts.filter((value) => value.present).map((value) =>
    sudoOperation(`remove-${value.name}`, "/bin/rm", [value.path], `Remove ${value.name}`));
  operations.push(sudoOperation("validate-sudoers", "/usr/sbin/visudo", ["-c"],
    "Validate the remaining sudoers configuration"));
  const receipt = report.packageReceipt.found
    ? Object.freeze({ identifier: policy.package.identifier, action: "forget",
      version: report.packageReceipt.version })
    : Object.freeze({ identifier: policy.package.identifier, action: "already_absent",
      version: null });
  if (receipt.action === "forget") {
    operations.push(sudoOperation("forget-receipt", "/usr/sbin/pkgutil",
      ["--forget", receipt.identifier], "Forget the canonical package receipt"));
  }
  const directoryPath = applicationDirectory(policy);
  const directory = report.pathSafety.directories.find((value) => value.path === directoryPath);
  const directoryAction = directory?.exists === true ? "remove_if_empty" : "already_absent";
  if (directoryAction === "remove_if_empty") {
    operations.push(sudoOperation("remove-application-directory", "/bin/rmdir", [directoryPath],
      "Remove the now-empty application policy directory"));
  }
  return Object.freeze({ schemaVersion: 1, state: classification.state,
    legacy: classification.state === "legacy"
      ? Object.freeze({ host: classification.legacyHost, stale1022: classification.stale1022 }) : null,
    account: report.invokingAccount ? Object.freeze({ name: report.invokingAccount.name,
      uid: report.invokingAccount.uid }) : null,
    artifacts: Object.freeze(artifacts), receipt,
    directory: Object.freeze({ path: directoryPath, action: directoryAction }),
    revokedCommands: Object.freeze(revokedCommands),
    operations: Object.freeze(operations), securityResiduals: SECURITY_RESIDUALS });
}
