// Prevents runtime or documentation additions from bypassing the exact distribution allowlist.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DISTRIBUTION_PAYLOAD } from "../../install/cli.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

function files(directory) {
  const absolute = path.join(root, directory);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? files(relative) : [relative.split(path.sep).join("/")];
  });
}

test("the allowlist exactly covers shipped domains and excludes development tests", () => {
  const wanted = [
    ...files("src"), ...files("libexec"), ...files("install"), ...files("docs"),
    ...files("LICENSES"),
    ...files("examples"), ...files("web").filter((name) => !name.startsWith("web/test/")),
    "CONTRIBUTING.md", "LICENSE", "NOTICE", "README.md", "SECURITY.md",
    "THIRD_PARTY_NOTICES.md", "VERSION",
    "bin/tm-u220", "bin/tm-u220.lua",
    "config/directives/aliases.u220a", "config/images/default.u220i",
    "config/printers/local.u220p",
  ].sort();
  const listed = DISTRIBUTION_PAYLOAD.map((entry) => entry.path).sort();
  assert.deepEqual(listed, wanted);
  assert.equal(new Set(listed).size, listed.length);
  assert.equal(listed.some((name) => name.startsWith("test/")), false);
});

test("local Markdown links resolve inside the shipped payload", () => {
  const listed = new Set(DISTRIBUTION_PAYLOAD.map((entry) => entry.path));
  const markdown = [...listed].filter((name) => name.endsWith(".md"));
  for (const name of markdown) {
    const source = fs.readFileSync(path.join(root, name), "utf8");
    for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const destination = match[1].split(/[?#]/, 1)[0];
      if (!destination || /^[a-z][a-z0-9+.-]*:/i.test(destination)) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name),
        decodeURIComponent(destination)));
      assert.equal(listed.has(resolved), true, `${name} links to unshipped ${resolved}`);
    }
  }
});
