#!/usr/bin/env node
// Runs the non-mutating installed-policy audit and optional authorized device verification.
// Device I/O reuses the installed passwordless privileged-source connection exactly.
import * as policyApi from "./printing_policy/index.mjs";
import { auditPrintingSetup } from "./printing_setup/audit.mjs";
import { checkAuthorizedDevice } from "./printing_setup/authorized_device_check.mjs";
import { runStatus } from "./printing_setup/status_cli.mjs";

const services = {
  audit: () => auditPrintingSetup(policyApi),
  probe: () => checkAuthorizedDevice(policyApi.loadInstalledPolicy().manifest),
};

try {
  process.exitCode = await runStatus(process.argv.slice(2), services);
} catch (error) {
  process.stderr.write(`TM-U220 printing status failed: ${error.message}\n`);
  process.exitCode = 1;
}
