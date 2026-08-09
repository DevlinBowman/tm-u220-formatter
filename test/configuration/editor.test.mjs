// Verifies the fixed Vim process contract without opening an interactive editor.
// Paths remain discrete arguments and child outcomes map to public CLI statuses.
import test from "node:test";
import assert from "node:assert/strict";
import { openInVim, VIM_PATH } from "../../libexec/configuration/editor.mjs";

test("opens both files as Vim tabs without a shell", () => {
  let invocation;
  const environment = { TERM: "xterm-256color" };
  const status = openInVim(["/tmp/aliases file.u220a", "/tmp/-profile.u220p"], {
    environment,
    spawn: (executable, args, options) => {
      invocation = { executable, args, options };
      return { status: 0, signal: null };
    },
  });
  assert.equal(status, 0);
  assert.equal(invocation.executable, VIM_PATH);
  assert.deepEqual(invocation.args,
    ["-p", "--", "/tmp/aliases file.u220a", "/tmp/-profile.u220p"]);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.stdio, "inherit");
  assert.equal(invocation.options.env, environment);
});

test("normalizes Vim failures and interrupt status", () => {
  assert.equal(openInVim(["/tmp/a"], { spawn: () => ({ status: 2, signal: null }) }), 1);
  assert.equal(openInVim(["/tmp/a"], { spawn: () => ({ status: null, signal: "SIGTERM" }) }), 1);
  assert.equal(openInVim(["/tmp/a"], { spawn: () => ({ status: null, signal: "SIGINT" }) }), 130);
  const failure = new Error("could not start Vim");
  assert.throws(() => openInVim(["/tmp/a"], {
    spawn: () => ({ error: failure, status: null, signal: null }),
  }), failure);
});
