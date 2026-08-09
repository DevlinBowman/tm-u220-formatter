// Orchestrates read-only planning and the sole explicit mutating removal path.
// Human and JSON reports preserve failures, verification evidence, and the no-rollback boundary.
import { parseRemovalArguments, REMOVAL_HELP, RemovalUsageError } from "./arguments.mjs";

export const REMOVAL_EXIT = Object.freeze({ OK: 0, REFUSED_OR_INCOMPLETE: 1, USAGE: 64 });

function commandText(operation) {
  return [operation.executable, ...operation.arguments].join(" ");
}

function baseReport(outcome, fields = {}) {
  return { kind: "tm-u220-printing-removal", schemaVersion: 1,
    outcome, mutationRequested: false, changed: false, rollbackAttempted: false, ...fields };
}

function humanPlan(value) {
  const { plan } = value;
  const lines = [
    "TM-U220 printing-policy removal: DRY RUN",
    "Changes made: no",
    `Recognized state: ${plan.state}`,
    ...(plan.legacy ? [`Legacy endpoint: ${plan.legacy.host}`,
      `Historical source-port 1022 grant: ${plan.legacy.stale1022 ? "present" : "absent"}`] : []),
    `Invoking account: ${plan.account.name} (UID ${plan.account.uid})`,
    "Fixed managed files:",
    ...plan.artifacts.map((item) => `  ${item.action}: ${item.path}`),
    `Package receipt: ${plan.receipt.action} ${plan.receipt.identifier}`
      + `${plan.receipt.version ? ` (version ${plan.receipt.version})` : ""}`,
    `Application policy directory: ${plan.directory.action} ${plan.directory.path}`,
    `Effective commands to revoke: ${plan.revokedCommands.length}`,
    ...plan.revokedCommands.map((command) => `  ${command}`),
    "Exact administrator command vectors:",
    ...plan.operations.map((operation) => `  ${commandText(operation)}`),
    "Security residuals:",
    ...plan.securityResiduals.map((item) => `  - ${item}`),
    "No rollback mechanism is claimed. Re-run with --remove to execute this exact plan.",
  ];
  return `${lines.join("\n")}\n`;
}

function humanRefusal(value) {
  return `TM-U220 printing-policy removal: REFUSED\nChanges made: no\nReason: ${value.error}\n`;
}

function humanResult(value) {
  const lines = [
    `TM-U220 printing-policy removal: ${value.outcome === "removed" ? "REMOVED" : "INCOMPLETE"}`,
    `Changes made: ${value.changed ? "yes" : "no"}`,
    `Recognized starting state: ${value.plan.state}`,
    `Administrator actions completed: ${value.execution.attempted}/${value.execution.total}`,
  ];
  for (const result of value.execution.results) {
    lines.push(`  ${result.success ? "ok" : "FAILED"}: ${result.id}`);
    if (result.stderr) lines.push(`    ${result.stderr}`);
  }
  lines.push(`Post-removal verification: ${value.verification.complete ? "complete" : "FAILED"}`);
  for (const issue of value.verification.issues) lines.push(`  ${issue.code}: ${issue.message}`);
  lines.push("Rollback attempted: no");
  if (value.outcome !== "removed") {
    lines.push("The machine may be partially changed; inspect it with 220 printing-status.");
  }
  lines.push("Security residuals:",
    ...value.plan.securityResiduals.map((item) => `  - ${item}`));
  return `${lines.join("\n")}\n`;
}

function emit(value, json, io) {
  if (json) io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (value.outcome === "planned") io.stdout.write(humanPlan(value));
  else if (value.outcome === "refused") io.stderr.write(humanRefusal(value));
  else io.stdout.write(humanResult(value));
}

export async function runRemoval(argv, services, io = process) {
  let options;
  try { options = parseRemovalArguments(argv); } catch (error) {
    if (!(error instanceof RemovalUsageError)) throw error;
    io.stderr.write(`${error.message}\n${REMOVAL_HELP}`);
    return REMOVAL_EXIT.USAGE;
  }
  if (options.help) {
    io.stdout.write(REMOVAL_HELP);
    return REMOVAL_EXIT.OK;
  }

  const before = await services.audit();
  let classification;
  let plan;
  try {
    classification = services.classify(before);
    plan = services.plan(before, classification);
  } catch (error) {
    const value = baseReport("refused", { error: String(error?.message || error), before });
    emit(value, options.json, io);
    return REMOVAL_EXIT.REFUSED_OR_INCOMPLETE;
  }
  if (!options.remove) {
    emit(baseReport("planned", { plan, before }), options.json, io);
    return REMOVAL_EXIT.OK;
  }

  const execution = await services.execute(plan);
  let after;
  let verification;
  try {
    after = await services.audit();
    verification = services.verify(after, plan);
  } catch (error) {
    verification = { complete: false, issues: [{ code: "POST_AUDIT_FAILED",
      message: String(error?.message || error) }] };
  }
  const removed = execution.complete && verification.complete;
  const changed = execution.results.some((result) => result.success);
  const value = baseReport(removed ? "removed" : "incomplete", {
    mutationRequested: true, changed, plan, execution, verification, after: after || null,
  });
  emit(value, options.json, io);
  return removed ? REMOVAL_EXIT.OK : REMOVAL_EXIT.REFUSED_OR_INCOMPLETE;
}
