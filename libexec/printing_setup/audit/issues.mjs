// Converts audit observations into stable actionable findings without changing the host.
// Keeping issue policy separate makes collection testable and the audit orchestrator declarative.
function issue(code, message) {
  return { code, severity: "error", message };
}

function collectPathIssues(pathSafety, issues) {
  for (const directory of pathSafety.directories) {
    if (!directory.checked) continue;
    if (directory.exists === false && directory.required) {
      issues.push(issue("CANONICAL_PARENT_ABSENT", `${directory.path} is absent`));
    } else if (!directory.safe) {
      issues.push(issue("CANONICAL_PARENT_UNSAFE",
        `${directory.path} is not a root:wheel 0755 non-symlinked directory`));
    }
  }
  if (pathSafety.managedEntries.error) {
    issues.push(issue("MANAGED_DIRECTORY_UNREADABLE",
      "the application-owned directory entries could not be inspected"));
  }
  if (pathSafety.managedEntries.unknown.length) {
    issues.push(issue("MANAGED_DIRECTORY_UNEXPECTED_ENTRY",
      `unmanaged entries exist in /private/etc/tm-u220: ${pathSafety.managedEntries.unknown
        .map((value) => JSON.stringify(value)).join(", ")}`));
  }
}

export function collectAuditIssues(parts) {
  const issues = [];
  if (!parts.environment.platform.supported) {
    issues.push(issue("UNSUPPORTED_PLATFORM", "printing setup is supported only on macOS"));
  }
  for (const dependency of parts.environment.dependencies) {
    if (!dependency.exists || !dependency.regularFile || !dependency.executable) {
      issues.push(issue("DEPENDENCY_UNAVAILABLE", `${dependency.path} is unavailable`));
    }
  }
  collectPathIssues(parts.pathSafety, issues);
  if (parts.invokingAccount.installedName !== null) {
    if (!parts.invokingAccount.available) {
      issues.push(issue("INVOKING_ACCOUNT_UNAVAILABLE",
        "the invoking real account could not be captured safely"));
    } else {
      if (!parts.invokingAccount.nameMatchesInstalled) {
        issues.push(issue("INVOKING_ACCOUNT_NAME_MISMATCH",
          "the invoking account name differs from the installed printing account"));
      }
      if (!parts.invokingAccount.uidMatchesInstalled) {
        issues.push(issue("INVOKING_ACCOUNT_UID_MISMATCH",
          "the invoking numeric UID differs from the installed printing account"));
      }
    }
  }
  const labels = { manifest: "MANIFEST", profile: "PROFILE", sudoers: "SUDOERS",
    legacyTombstone: "LEGACY_TOMBSTONE" };
  for (const [name, value] of Object.entries(parts.artifacts)) {
    if (value.exists === false) issues.push(issue(`${labels[name]}_ABSENT`, `${name} is absent`));
    else if (value.exists !== true) {
      issues.push(issue(`${labels[name]}_INSPECTION_FAILED`, `${name} could not be inspected safely`));
    } else if (!value.metadataValid) {
      issues.push(issue(`${labels[name]}_METADATA`, `${name} metadata does not match policy`));
    }
  }
  const { manifest, profile } = parts.artifacts;
  if (manifest.exists && !manifest.readable) {
    issues.push(issue("MANIFEST_UNREADABLE", "manifest cannot be read safely"));
  }
  if (!manifest.schema.valid) {
    issues.push(issue("MANIFEST_SCHEMA_INVALID", "manifest does not satisfy the canonical schema"));
  }
  if (profile.exists && !profile.readable) {
    issues.push(issue("PROFILE_UNREADABLE", "selected profile cannot be read safely"));
  }
  if (!profile.schema.valid) {
    issues.push(issue("PROFILE_SCHEMA_INVALID", "selected profile is not canonical"));
  }
  if (profile.expected.sha256 && profile.hashMatches !== true) {
    issues.push(issue("PROFILE_HASH_MISMATCH", "selected profile hash differs from the manifest"));
  }
  if (!parts.packageReceipt.found) {
    const invalid = parts.packageReceipt.queried
      && Boolean(parts.packageReceipt.reportedIdentifier || parts.packageReceipt.version);
    issues.push(issue(invalid ? "PACKAGE_RECEIPT_INVALID" : "PACKAGE_RECEIPT_ABSENT",
      invalid ? "printing package receipt identity or version is invalid"
        : "canonical printing package receipt is absent"));
  }
  if (!parts.authorization.available) {
    issues.push(issue("SUDO_LIST_UNAVAILABLE", "effective sudo permissions could not be listed"));
  }
  if (parts.authorization.missing.length > 0) {
    issues.push(issue("SUDO_COMMANDS_MISSING",
      `${parts.authorization.missing.length} expected netcat command(s) are not active`));
  }
  if (parts.authorization.misconfigured.length > 0) {
    issues.push(issue("SUDO_COMMANDS_WEAK",
      `${parts.authorization.misconfigured.length} expected command grant(s) lack required options`));
  }
  if (parts.authorization.extra.length > 0) {
    issues.push(issue("SUDO_COMMANDS_EXTRA",
      `${parts.authorization.extra.length} extra passwordless netcat command(s) remain active`));
  }
  if (parts.authorization.broad.length > 0) {
    issues.push(issue("SUDO_BROAD_NETCAT_GRANT",
      "a broad passwordless root grant can authorize unreviewed netcat commands"));
  }
  if (parts.authorization.extra.some((command) =>
    /^\/usr\/bin\/nc -w [1-9][0-9]* -p 1022 \S+ 515$/.test(command))) {
    issues.push(issue("LEGACY_1022_COMMAND_ACTIVE",
      "the historical passwordless LPD command on source port 1022 is still active"));
  }
  if (parts.renderError) {
    issues.push(issue("POLICY_RENDER_FAILED", "installed manifest could not render its exact policy"));
  }
  return issues;
}
