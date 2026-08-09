import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  NetcatConnection,
  commandPolicy,
  isAuthorizationFailure,
  shouldRotateSourcePort,
} from "../../libexec/live_session/netcat.mjs";

function childProcess() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => true;
  child.unref = () => {};
  return child;
}

test("privileged command policy is fixed and argument-array based", () => {
  assert.equal(commandPolicy.executable, "/usr/bin/sudo");
  assert.deepEqual(commandPolicy.fixedArguments,
    ["-n", "--", "/usr/bin/nc", "-w", "30", "-p"]);
});

test("bind stderr wins an earlier EPIPE race and permits internal rotation", () => {
  const child = childProcess();
  const connection = new NetcatConnection(child, 1023);
  const early = new Error("write EPIPE");
  child.stdin.emit("error", early);
  child.stderr.write("nc: bind: Address already in use\n");
  child.exitCode = 1;
  child.emit("close", 1, null);

  assert.match(connection.failure(early).message, /Address already in use/);
  assert.equal(shouldRotateSourcePort(connection, early), true);
});

test("silent early netcat exit rotates, but printer response failures do not", () => {
  const child = childProcess();
  const connection = new NetcatConnection(child, 1023);
  child.exitCode = 1;
  child.emit("close", 1, null);
  assert.equal(shouldRotateSourcePort(connection, connection.exitError), true);

  const respondedChild = childProcess();
  const responded = new NetcatConnection(respondedChild, 1021);
  respondedChild.stdout.write(Buffer.from([0x16]));
  respondedChild.exitCode = 1;
  respondedChild.emit("close", 1, null);
  assert.equal(shouldRotateSourcePort(responded, responded.exitError), false);
});

test("missing narrow sudo authorization is actionable and never rotates", () => {
  const error = new Error("sudo: a password is required");
  assert.equal(isAuthorizationFailure(error), true);
  assert.equal(isAuthorizationFailure(new Error("nc: bind: Address already in use")), false);

  const child = childProcess();
  const connection = new NetcatConnection(child, 1023);
  child.stderr.write("sudo: a password is required\n");
  child.exitCode = 1;
  child.emit("close", 1, null);
  assert.equal(shouldRotateSourcePort(connection, connection.exitError), false);
});
