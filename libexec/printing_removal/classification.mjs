// Admits removal only for a healthy canonical policy or the exact legacy shapes setup recognizes.
// Unsafe, ambiguous, weak, broad, uninspectable, and wrong-account states fail closed.
import { classifySetupPreflight } from "../printing_setup/setup_preflight.mjs";

export class RemovalRefusalError extends Error {
  constructor(message) {
    super(`automatic printing-policy removal refused: ${message}`);
    this.name = "RemovalRefusalError";
  }
}

function refuse(message) {
  throw new RemovalRefusalError(message);
}

function requireInvokingAccount(report) {
  const account = report?.invokingAccount;
  if (!account?.available) refuse("the invoking non-root account cannot be established safely");
  if (account.installedName !== null && account.matchesInstalled !== true) {
    refuse("the invoking account does not exactly match the installed name and numeric UID");
  }
}

function requireInspectableReceipt(report) {
  const receipt = report?.packageReceipt;
  if (!receipt?.queried) refuse("the canonical package receipt could not be inspected");
  if (!receipt.found && (receipt.reportedIdentifier || receipt.version)) {
    refuse("the canonical package receipt is internally inconsistent");
  }
}

export function classifyRemoval(report) {
  requireInvokingAccount(report);
  requireInspectableReceipt(report);
  let preflight;
  try {
    preflight = classifySetupPreflight(report);
  } catch (error) {
    refuse(String(error?.message || error));
  }

  if (preflight.state === "active") {
    if (!report.healthy || report.authorization.exact !== true
        || report.packageReceipt.found !== true) {
      refuse("the canonical policy is not completely healthy and exact");
    }
    return Object.freeze({ state: "canonical", commandCount: report.authorization.active.length,
      legacyHost: null, stale1022: false });
  }
  if (preflight.state === "legacy") {
    if (report.packageReceipt.found) {
      refuse("a canonical package receipt exists without a canonical installed policy");
    }
    if (report.authorization.extra.length !== preflight.legacyCommands) {
      refuse("the effective legacy command set changed during classification");
    }
    return Object.freeze({ state: "legacy", commandCount: preflight.legacyCommands,
      legacyHost: preflight.legacyHost, stale1022: preflight.stale1022 });
  }
  if (preflight.state === "fresh") refuse("no recognized installed printing policy exists");
  refuse("the canonical policy requires repair or manual review before removal");
}
