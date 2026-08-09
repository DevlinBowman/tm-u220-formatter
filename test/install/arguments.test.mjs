// Verifies that distribution commands require explicit, unambiguous paths and removal intent.
import test from "node:test";
import assert from "node:assert/strict";
import { parseArguments } from "../../install/arguments.mjs";

const runtime = { homedir: () => "/Users/example" };

test("bare invocation requests help without resolving an installation prefix", () => {
  const noPrefix = { homedir: () => { throw new Error("must not resolve a prefix"); } };
  assert.deepEqual(parseArguments([], noPrefix), { help: true });
  assert.deepEqual(parseArguments(["help"], noPrefix), { help: true });
  assert.deepEqual(parseArguments(["install", "--help"], noPrefix), { help: true });
});

test("explicit install uses a user-local default prefix and uninstall is a dry run", () => {
  assert.equal(parseArguments(["install"], runtime).prefix, "/Users/example/.local");
  const parsed = parseArguments(["uninstall"], runtime);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.remove, false);
});

test("an installed manager can supply its own prefix as the default", () => {
  assert.equal(parseArguments(["inspect"], { defaultPrefix: "/custom/prefix" }).prefix,
    "/custom/prefix");
});

test("accepts an explicit absolute prefix and removal", () => {
  const parsed = parseArguments(["uninstall", "--prefix", "/opt/example", "--remove",
    "--keep-printing-policy"], runtime);
  assert.equal(parsed.prefix, "/opt/example");
  assert.equal(parsed.remove, true);
  assert.equal(parsed.dryRun, false);
  assert.equal(parsed.keepPrintingPolicy, true);
});

test("rejects relative prefixes and destructive options on other commands", () => {
  assert.throws(() => parseArguments(["install", "--prefix", "relative"], runtime), /absolute/);
  assert.throws(() => parseArguments(["inspect", "--remove"], runtime), /not accepted with inspect/);
  assert.throws(() => parseArguments(["version", "--prefix", "/tmp/x"], runtime),
    /not accepted with version/);
  assert.throws(() => parseArguments(["version", "--json"], runtime), /not accepted with version/);
  assert.throws(() => parseArguments(["help", "version"], runtime), /does not accept/);
  assert.throws(() => parseArguments(["--help", "--json"], runtime), /cannot be combined/);
  assert.throws(() => parseArguments(["install", "--help", "--json"], runtime),
    /cannot be combined/);
  assert.throws(() => parseArguments(["uninstall", "--remove", "--dry-run"], runtime), /either/);
  assert.throws(() => parseArguments(["uninstall", "--dry-run", "--remove"], runtime), /either/);
  assert.throws(() => parseArguments(["inspect", "--json", "--json"], runtime), /only once/);
  assert.throws(() => parseArguments(["inspect", "--keep-printing-policy"], runtime),
    /not accepted with inspect/);
});
