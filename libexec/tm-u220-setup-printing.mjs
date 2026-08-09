#!/usr/bin/env node
// Wires the canonical printing-policy modules into the reviewed macOS setup workflow.
// This entry point contains no machine-specific account, address, profile, or sudoers bytes.
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as policyApi from "./printing_policy/index.mjs";
import { buildReviewerApp, launchReviewer } from "./printing_setup/app_bundle.mjs";
import { auditPrintingSetup } from "./printing_setup/audit.mjs";
import { checkAuthorizedDevice } from "./printing_setup/authorized_device_check.mjs";
import { buildPackage } from "./printing_setup/package.mjs";
import {
  parseSetupArguments, SETUP_USAGE, SetupUsageError,
} from "./printing_setup/setup_arguments.mjs";
import {
  describeProfile, runSetupAssistant,
} from "./printing_setup/setup_assistant.mjs";
import { assertSetupEnvironment } from "./printing_setup/setup_environment.mjs";
import { classifySetupPreflight } from "./printing_setup/setup_preflight.mjs";
import {
  bundledProfilePath, resolveProfileReference,
} from "./printing_setup/profile_reference.mjs";
import { runSetup } from "./printing_setup/setup_workflow.mjs";

const helperPath = fileURLToPath(import.meta.url);
const applicationRoot = path.resolve(path.dirname(helperPath), "..");
const invocationDirectory = process.cwd();
const defaultProfilePath = bundledProfilePath(applicationRoot);
const reviewerScriptPath = path.join(path.dirname(helperPath), "printing_setup", "reviewer.js");

const services = Object.freeze({
  parseArguments: parseSetupArguments,
  assertEnvironment: assertSetupEnvironment,
  captureIdentity: policyApi.captureCurrentIdentity,
  loadInstalledPolicy: policyApi.loadInstalledPolicy,
  loadSelectedProfile: policyApi.loadSelectedProfile,
  resolveProfileReference: (reference) => resolveProfileReference(reference,
    { applicationRoot, cwd: invocationDirectory }),
  validateHost: policyApi.validatePrinterIPv4,
  selectSetup: (input) => runSetupAssistant({ ...input, defaultProfilePath,
    defaultProfileDescription: describeProfile(policyApi.loadSelectedProfile(defaultProfilePath)) }),
  audit: () => auditPrintingSetup(policyApi),
  classifyPreflight: classifySetupPreflight,
  createPolicy: policyApi.createPrintingPolicy,
  buildPackage,
  buildReviewer: buildReviewerApp,
  launchReviewer,
  checkDevice: checkAuthorizedDevice,
  reviewerScriptPath,
});

try {
  process.exitCode = await runSetup(process.argv.slice(2), services);
} catch (error) {
  process.stderr.write(`TM-U220 Printing Setup failed: ${error.message}\n`);
  if (error instanceof SetupUsageError) process.stderr.write(SETUP_USAGE);
  process.exitCode = error.exitCode || 1;
}
