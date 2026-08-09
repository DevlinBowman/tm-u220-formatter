// Verifies authorization-first review, cancellation, and post-install audit gates.
// Device contact occurs only through the bypass after its installation is verified.
import test from "node:test";
import assert from "node:assert/strict";
import { runSetup } from "../../libexec/printing_setup/setup_workflow.mjs";
import { workflowFixture } from "./setup_test_support.mjs";

const ARGS = ["--host", "192.168.50.41", "--profile", "printer.u220p"];

test("workflow defers device contact until after installation verification", async () => {
  const fixture = workflowFixture();
  const code = await runSetup(ARGS, fixture.services, fixture.io,
    { now: () => new Date("2026-08-08T12:00:00.000Z") });
  assert.equal(code, 0);
  assert.deepEqual(fixture.state(), { audits: 2, built: true, deviceContacts: 1 });
  assert.deepEqual(fixture.policyInput().probe, {
    mode: "deferred", recordedAt: "2026-08-08T12:00:00.000Z",
    reason: "privileged_source_required",
  });
  assert.match(fixture.output.stdout, /Printer contact is deferred/);
  assert.match(fixture.output.stdout, /all 19 exact commands are active/);
  assert.match(fixture.output.stdout, /newly installed privileged-source bypass/);
  assert.match(fixture.output.stdout, /TM-U220 verified and ready/);
});

test("retired offline setup option fails before audit, packaging, or device contact", async () => {
  const fixture = workflowFixture();
  await assert.rejects(runSetup([...ARGS, "--allow-offline"], fixture.services, fixture.io),
    /unknown setup option/);
  assert.deepEqual(fixture.state(), { audits: 0, built: false, deviceContacts: 0 });
});

test("review cancellation returns success without claiming installation", async () => {
  const fixture = workflowFixture("cancelled\n");
  assert.equal(await runSetup(ARGS, fixture.services, fixture.io), 0);
  assert.deepEqual(fixture.state(), { audits: 1, built: true, deviceContacts: 0 });
  assert.match(fixture.output.stdout, /no system change was requested/);
  assert.doesNotMatch(fixture.output.stdout, /Authorized device check/);
});

test("bare setup opens the native selection assistant before local policy work", async () => {
  const fixture = workflowFixture("cancelled\n");
  assert.equal(await runSetup([], fixture.services, fixture.io), 0);
  assert.deepEqual(fixture.assistedInput(), {
    host: null, suggestedHost: null, profilePath: null,
  });
  assert.match(fixture.output.stdout, /no system change was requested/);
});

test("cancelling the native selection assistant performs no device or package work", async () => {
  const fixture = workflowFixture("installer-closed\n",
    { cancelled: true });
  assert.equal(await runSetup([], fixture.services, fixture.io), 0);
  assert.deepEqual(fixture.state(), { audits: 0, built: false, deviceContacts: 0 });
  assert.match(fixture.output.stdout, /Setup cancelled/);
});

test("partial automation stays non-interactive and reports the missing choice", async () => {
  const fixture = workflowFixture();
  await assert.rejects(runSetup(["--host", "192.168.50.41"],
    fixture.services, fixture.io), /--profile FILE/);
  assert.equal(fixture.assistedInput(), null);
  assert.deepEqual(fixture.state(), { audits: 0, built: false, deviceContacts: 0 });
});

test("host validation rejects non-LAN destinations before local policy work", async () => {
  const fixture = workflowFixture();
  fixture.services.validateHost = () => { throw new Error("private IPv4 required"); };
  await assert.rejects(runSetup(ARGS, fixture.services, fixture.io), /private IPv4 required/);
  assert.deepEqual(fixture.state(), { audits: 0, built: false, deviceContacts: 0 });
});
