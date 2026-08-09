// Verifies strict parsing of effective sudo entries, including denials and weak duplicates.
import test from "node:test";
import assert from "node:assert/strict";
import { parseSudoListing } from "../../libexec/printing_setup/audit/sudo.mjs";

function entry(command, options = "!setenv, noexec, !authenticate") {
  return ["Sudoers entry:", "  RunAsUsers: root", `  Options: ${options}`,
    "  Commands:", `    ${command}`].join("\n");
}

test("only positive root NOPASSWD netcat grants count as extras", () => {
  const expected = "/usr/bin/nc -w 30 -p 1023 192.168.1.220 9100";
  const extra = "/usr/bin/nc -w 5 -p 1022 192.168.1.220 515";
  const listing = [entry(expected), entry(`!${extra}`), entry(extra)].join("\n\n");
  const result = parseSudoListing(listing, [expected]);
  assert.deepEqual(result.active, [expected]);
  assert.deepEqual(result.extra, [extra]);
  assert.deepEqual(result.extraDetails, [{ command: extra, rootOnly: true,
    nopasswd: true, noexec: true, nosetenv: true }]);
  assert.equal(result.exact, false);
});

test("extra detail never treats a broader RunAs entry as root-only", () => {
  const extra = "/usr/bin/nc -w 5 -p 1022 192.168.1.220 515";
  const listing = entry(extra).replace("RunAsUsers: root", "RunAsUsers: ALL");
  const result = parseSudoListing(listing, []);
  assert.deepEqual(result.extraDetails, [{ command: extra, rootOnly: false,
    nopasswd: true, noexec: true, nosetenv: true }]);
});

test("a weak duplicate is visible even when an exact grant is also active", () => {
  const expected = "/usr/bin/nc -w 30 -p 1023 192.168.1.220 9100";
  const result = parseSudoListing([
    entry(expected), entry(expected, "!authenticate"),
  ].join("\n\n"), [expected]);
  assert.deepEqual(result.active, [expected]);
  assert.equal(result.missing.length, 0);
  assert.equal(result.misconfigured.length, 1);
  assert.equal(result.misconfigured[0].noexec, false);
  assert.equal(result.exact, false);
});

test("an explicit denial prevents an expected command from being declared active", () => {
  const expected = "/usr/bin/nc -w 30 -p 1023 192.168.1.220 9100";
  const result = parseSudoListing([entry(expected), entry(`!${expected}`)].join("\n\n"),
    [expected]);
  assert.deepEqual(result.active, []);
  assert.deepEqual(result.missing, [expected]);
  assert.deepEqual(result.extra, []);
  assert.equal(result.exact, false);

  const deniedAll = parseSudoListing([entry(expected), entry("!ALL")].join("\n\n"), [expected]);
  assert.deepEqual(deniedAll.active, []);
  assert.deepEqual(deniedAll.missing, [expected]);
});

test("broad passwordless root grants cannot hide behind exact entries", () => {
  const expected = "/usr/bin/nc -w 30 -p 1023 192.168.1.220 9100";
  const result = parseSudoListing([entry(expected), entry("ALL")].join("\n\n"), [expected]);
  assert.deepEqual(result.active, [expected]);
  assert.deepEqual(result.broad, ["ALL"]);
  assert.equal(result.exact, false);

  const globbed = parseSudoListing(entry("/usr/bin/[n]c *"), [expected]);
  assert.deepEqual(globbed.broad, ["/usr/bin/[n]c *"]);
  assert.equal(globbed.exact, false);

  const arbitraryArguments = parseSudoListing([
    entry("/usr/bin/nc"), entry("/usr/bin/nc *"),
  ].join("\n\n"), [expected]);
  assert.deepEqual(arbitraryArguments.broad, ["/usr/bin/nc", "/usr/bin/nc *"]);
  assert.equal(arbitraryArguments.exact, false);

  const allRunAs = parseSudoListing(entry("ALL").replace("RunAsUsers: root", "RunAsUsers: ALL"),
    [expected]);
  assert.deepEqual(allRunAs.broad, ["ALL"]);
  assert.equal(allRunAs.exact, false);
});
