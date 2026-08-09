#!/usr/bin/env node
// Runs the explicit printer-policy removal planner and administrator workflow.
// The default path is read-only; only --remove can reach fixed sudo command vectors.
import * as policyApi from "./printing_policy/index.mjs";
import { auditPrintingSetup } from "./printing_setup/audit.mjs";
import { classifyRemoval } from "./printing_removal/classification.mjs";
import { createRemovalPlan } from "./printing_removal/plan.mjs";
import { executeRemoval } from "./printing_removal/executor.mjs";
import { runRemoval } from "./printing_removal/cli.mjs";
import { verifyRemoval } from "./printing_removal/verification.mjs";

const services = {
  audit: () => auditPrintingSetup(policyApi),
  classify: classifyRemoval,
  plan: (report, classification) => createRemovalPlan(report, classification,
    policyApi.printingPolicy),
  execute: (plan) => executeRemoval(plan),
  verify: verifyRemoval,
};

try {
  process.exitCode = await runRemoval(process.argv.slice(2), services);
} catch (error) {
  process.stderr.write(`TM-U220 printing-policy removal failed: ${error.message}\n`);
  process.exitCode = 1;
}
