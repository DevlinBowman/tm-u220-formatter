// Exercises the shipped launcher as a process-boundary contract for safe, non-mutating commands.
// Temporary authored and device-response fixtures keep the suite independent of repository examples.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const launcher = fileURLToPath(new URL("../../bin/tm-u220", import.meta.url));
const releaseVersion = readFileSync(new URL("../../VERSION", import.meta.url), "utf8").trim();

let fixtureRoot;
let fakeNode;
let jobPath;
let responsePath;

before(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "tm-u220-cli-contract-"));
  fakeNode = join(fixtureRoot, "node");
  jobPath = join(fixtureRoot, "contract receipt.u220");
  responsePath = join(fixtureRoot, "model response.hex");
  writeFileSync(fakeNode, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n");
  chmodSync(fakeNode, 0o755);
  writeFileSync(jobPath, [
    "!tm-u220 job 1",
    "@profile variant=B paper=76 dip2_1=off cutter=partial",
    "CLI CONTRACT",
    "@fi",
    "",
  ].join("\n"));
  writeFileSync(responsePath, "0D\n");
});

after(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function invoke(args, options = {}) {
  const result = spawnSync(launcher, args, {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 10000,
    ...options,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  return result;
}

function succeed(args, options) {
  const result = invoke(args, options);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return result;
}

test("global help spellings share one overview", () => {
  const outputs = [[], ["help"], ["--help"], ["-h"]]
    .map((args) => succeed(args).stdout);

  assert.equal(outputs[1], outputs[0]);
  assert.equal(outputs[2], outputs[0]);
  assert.equal(outputs[3], outputs[0]);
  assert.match(outputs[0], /^220 - /);
  assert.match(outputs[0], /220 check/);
  assert.match(outputs[0], /220 help/);
});

test("focused help is identical before or after the command", () => {
  const canonical = succeed(["help", "compile"]).stdout;

  assert.equal(succeed(["compile", "--help"]).stdout, canonical);
  assert.equal(succeed(["compile", "-h"]).stdout, canonical);
  assert.match(canonical, /Usage:\s+220 compile/);
  assert.match(canonical, /--hex/);
  assert.doesNotMatch(canonical, /Usage:\s+220 print/);
});

test("version commands report the release version", () => {
  const expected = `220 ${releaseVersion}\n`;
  assert.equal(succeed(["version"]).stdout, expected);
  assert.equal(succeed(["--version"]).stdout, expected);
});

test("check validates a temporary authored job", () => {
  const result = succeed(["check", jobPath]);
  assert.match(result.stdout, /^ok: [^,]+, \d+ operations, \d+ bytes\n$/);
});

test("compile emits canonical hex to implicit and explicit stdout", () => {
  const implicit = succeed(["compile", jobPath, "--hex"]).stdout;
  const explicit = succeed(["compile", jobPath, "--hex", "-o", "-"]).stdout;

  assert.equal(explicit, implicit);
  assert.match(implicit, /^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*\n$/);
  assert.match(implicit, /43 4C 49 20 43 4F 4E 54 52 41 43 54/);
});

test("render JSON exposes the compiled receipt plan", () => {
  const result = JSON.parse(succeed(["render", jobPath, "--json"]).stdout);

  assert.deepEqual(result.diagnostics, []);
  assert.equal(typeof result.profile.id, "string");
  assert.ok(result.lines.some((line) => line.text === "CLI CONTRACT"));
  assert.ok(Array.isArray(result.paper_preview.events));
});

test("preview owns the browser workspace and edit is removed", () => {
  const previewHelp = succeed(["preview", "--help"]).stdout;
  const renderHelp = succeed(["render", "--help"]).stdout;

  assert.match(previewHelp, /live graphical receipt|browser/i);
  assert.doesNotMatch(previewHelp, /--json/);
  assert.match(renderHelp, /--json/);

  const removed = invoke(["edit", jobPath]);
  assert.equal(removed.status, 2);
  assert.equal(removed.stdout, "");
  assert.match(removed.stderr, /unknown command: edit/);
});

test("preview routes through the browser workspace launcher", () => {
  const result = succeed(["preview", jobPath], {
    env: {
      ...process.env,
      PATH: `${fixtureRoot}${delimiter}${process.env.PATH ?? ""}`,
    },
  });

  assert.equal(result.stdout,
    [join(projectRoot, "web/server/main.mjs"), jobPath,
      "--profile", join(projectRoot, "config/printers/local.u220p"),
      "--aliases", join(projectRoot, "config/directives/aliases.u220a"),
      "--image-profile", join(projectRoot, "config/images/default.u220i"), ""].join("\n"));
});

test("developer glyphs routes through the fixed checkout launcher", () => {
  const result = succeed(["dev", "glyphs"], {
    env: {
      ...process.env,
      PATH: `${fixtureRoot}${delimiter}${process.env.PATH ?? ""}`,
    },
  });

  assert.equal(result.stdout,
    `${join(projectRoot, "dev/glyph_editor/server/main.mjs")}\n`);
});

test("inspect infers authored input and exposes compiled nodes", () => {
  const result = JSON.parse(succeed(["inspect", jobPath, "--json"]).stdout);

  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.nodes.some((node) => node.kind === "text"
    && node.value === "CLI CONTRACT"));
  assert.equal(result.nodes[0].id, "control.initialize");
});

test("profile queries and response decoding are machine-readable", () => {
  const queries = JSON.parse(succeed(["profile-queries", "--json"]).stdout);
  const modelQuery = queries.find((query) => query.id === "gs_i.model_id");
  assert.equal(modelQuery.request_hex, "1D 49 01");

  const fact = JSON.parse(succeed([
    "profile-decode", "gs_i.model_id", responsePath, "--json",
  ]).stdout);
  assert.equal(fact.kind, "model_id");
  assert.equal(fact.printer_model_id, 13);
  assert.equal(fact.response_hex, "0D");
});

test("rules renders the requested canonical reference topic", () => {
  const result = succeed(["rules", "directives"]);
  assert.match(result.stdout, /^220 rules directives - Canonical job directives/);
  assert.match(result.stdout, /@text TEXT/);
  assert.match(result.stdout, /@fi/);
});

test("directives is the compact reference fast path", () => {
  const result = succeed(["directives"]);
  assert.match(result.stdout, /^220 directives - Valid job directives/);
  assert.match(result.stdout, /Printer-native and job-system directives:/);
  assert.match(result.stdout, /Formatter-defined utilities:/);
  assert.match(result.stdout, /@table \[TABLE_ALIGN,\]COLUMN/);
  assert.doesNotMatch(result.stdout, /A COLUMN's first suffix/);
});

test("config focused help exposes the fixed Vim workflow", () => {
  const result = succeed(["config", "--help"]);
  assert.match(result.stdout, /Usage:\s+220 config/);
  assert.match(result.stdout, /Vim opens the directive aliases/);
  assert.match(result.stdout, /user-owned copies/);
});

test("config rejects a noninteractive process before creating files", () => {
  const configRoot = join(fixtureRoot, "noninteractive-config");
  const result = invoke(["config"], { env: {
    ...process.env,
    TM_U220_CONFIG_HOME: configRoot,
  } });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /interactive terminal|available only on macOS/);
  assert.equal(existsSync(configRoot), false);
});

test("the option terminator permits option-looking explicit text", () => {
  const result = succeed(["render", "--text", "--", "--json"]);
  assert.match(result.stdout, /--json/);
  assert.doesNotMatch(result.stdout, /^\{/);
});

test("usage failures are one concise diagnostic and exit 2", () => {
  const cases = [
    { args: ["definitely-not-a-command"], reason: "unknown command: definitely-not-a-command" },
    { args: ["version", "--json"], reason: "--json is not accepted with version" },
    { args: ["--help", "--version"], reason: "use --help or --version, not both" },
    { args: ["compile", "--version"],
      reason: "--version is accepted only before a command" },
    { args: ["profile-decode", "gs_i.not-real", "definitely-missing.hex"],
      reason: "unknown profile query ID \"gs_i.not-real\"; run '220 profile-queries' to list supported IDs" },
  ];

  for (const item of cases) {
    const result = invoke(item.args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr,
      `220: ${item.reason}; run '220 help' for usage\n`);
    assert.equal(result.stderr.trim().split("\n").length, 1);
  }
});
