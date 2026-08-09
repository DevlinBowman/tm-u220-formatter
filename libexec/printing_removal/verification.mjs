// Verifies that every fixed artifact, receipt, and previously audited effective grant is gone.
// New or uninspectable authorization after mutation prevents a success claim.

function finding(code, message) {
  return Object.freeze({ code, message });
}

export function verifyRemoval(report, plan) {
  const issues = [];
  if (!report?.pathSafety?.safe) {
    issues.push(finding("POST_PATH_UNSAFE", "canonical paths cannot be inspected safely after removal"));
  }
  for (const artifact of plan.artifacts) {
    const observed = report?.artifacts?.[artifact.name];
    if (!observed || observed.path !== artifact.path || observed.exists !== false) {
      issues.push(finding("POST_ARTIFACT_REMAINS", `${artifact.path} is not verified absent`));
    }
  }
  if (!report?.packageReceipt?.queried || report.packageReceipt.found
      || report.packageReceipt.reportedIdentifier || report.packageReceipt.version) {
    issues.push(finding("POST_RECEIPT_REMAINS",
      `${plan.receipt.identifier} is not verified absent`));
  }
  const authorization = report?.authorization;
  if (!authorization?.available) {
    issues.push(finding("POST_AUTHORIZATION_UNINSPECTABLE",
      "effective sudo permissions cannot be inspected after removal"));
  } else {
    const effective = new Set([...(authorization.active || []), ...(authorization.extra || [])]);
    const lingering = plan.revokedCommands.filter((command) => effective.has(command));
    if (lingering.length) {
      issues.push(finding("POST_COMMANDS_REMAIN",
        `${lingering.length} removed-policy command(s) remain effectively authorized`));
    }
    if ((authorization.broad || []).length || (authorization.extra || []).length) {
      issues.push(finding("POST_AUTHORIZATION_CHANGED",
        "broad or unrecognized passwordless netcat authorization exists after removal"));
    }
  }
  const directory = report?.pathSafety?.directories?.find(
    (value) => value.path === plan.directory.path);
  if (!directory || directory.exists !== false) {
    issues.push(finding("POST_DIRECTORY_REMAINS",
      `${plan.directory.path} is not verified absent`));
  }
  return Object.freeze({ complete: issues.length === 0, issues: Object.freeze(issues) });
}
