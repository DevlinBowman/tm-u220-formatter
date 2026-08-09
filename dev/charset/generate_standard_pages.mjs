#!/usr/bin/env node
// Regenerates the public single-byte page modules from pinned Unicode mapping data.
// It writes only the project's declared standard catalog and generated specimen.
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const inputRoot = process.argv[2] && resolve(process.argv[2]);

const definitions = Object.freeze([
  { id: 0, name: "PC437", input: "CP437.TXT", output: "page_00_pc437.lua",
    sha256: "6bad4dabcdf5940227c7d81fab130dcb18a77850b5d79de28b5dc4e047b0aaac" },
  { id: 2, name: "PC850", input: "CP850.TXT", output: "page_02_pc850.lua",
    sha256: "ffdcc3c1c72f1aef600a63547100ef3dc452a09ad84923d382085519751c7479" },
  { id: 3, name: "PC860", input: "CP860.TXT", output: "page_03_pc860.lua",
    sha256: "1b3f983eac02d9ae9fc28106f2f3476ca1e4b337c7287f1a004372e14dd11e6a" },
  { id: 4, name: "PC863", input: "CP863.TXT", output: "page_04_pc863.lua",
    sha256: "f467a2a652ce3f74bb3fa86c8767dd06cbde90edfb73bf3a5541ae4cbe806d7b" },
  { id: 5, name: "PC865", input: "CP865.TXT", output: "page_05_pc865.lua",
    sha256: "e31eeb03a39a5fbdd5e23de60a22af4219c9987de2088386855ab20f273f470a" },
  { id: 16, name: "WPC1252", input: "CP1252.TXT", output: "page_16_wpc1252.lua",
    sha256: "f607ae328b4dff5e9bfef725f5fff0ae23f38797f8a5b95998a0d2735c0e8fad" },
  { id: 17, name: "PC866", input: "CP866.TXT", output: "page_17_pc866.lua",
    sha256: "abcc96dd4253321eb5e542c1ece3adab10df0cc20ec5d1124a0cec22d636c924" },
  { id: 18, name: "PC852", input: "CP852.TXT", output: "page_18_pc852.lua",
    sha256: "440d098e9f2b79eeacbe2bbc1814960b6554c885740615047f5b528c2947afb6" },
  { id: 19, name: "PC858", input: "CP850.TXT", output: "page_19_pc858.lua",
    sha256: "ffdcc3c1c72f1aef600a63547100ef3dc452a09ad84923d382085519751c7479",
    replacements: { 0xD5: 0x20AC } },
]);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseMapping(source) {
  const mapping = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^0x([0-9A-Fa-f]{2})\s+0x([0-9A-Fa-f]{4,6})(?:\s|$)/);
    if (match) mapping.set(Number.parseInt(match[1], 16), Number.parseInt(match[2], 16));
  }
  return mapping;
}

function luaString(codepoint) {
  if (codepoint === 0xA0 || codepoint === 0xAD) {
    return `"\\u{${codepoint.toString(16).toUpperCase().padStart(4, "0")}}"`;
  }
  return JSON.stringify(String.fromCodePoint(codepoint));
}

function renderPage(definition, mapping) {
  const firstByte = definition.id === 0 ? 0x20 : 0x80;
  const lines = [
    "-- Generated from Unicode, Inc. character mapping data under Unicode-3.0.",
    "-- Source hashes and generation details: THIRD_PARTY_NOTICES.md.",
    "return {",
  ];
  for (let byte = firstByte; byte <= 0xFF; byte += 1) {
    const codepoint = mapping.get(byte);
    if (codepoint == null || codepoint < 0x20 || codepoint === 0x7F) continue;
    lines.push(`    [0x${byte.toString(16).toUpperCase().padStart(2, "0")}] = ${luaString(codepoint)},`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

function renderSpecimen(loaded) {
  const lines = [
    "!tm-u220 job 1",
    "# Generated from the Unicode-licensed standard page modules; do not edit by hand.",
    "# Covers every mapping distributed in the public standard-page catalog.",
    "@align center", "STANDARD CODE PAGE TEST", "@align left", "",
  ];
  for (const { definition, mapping } of loaded) {
    const firstColumn = definition.id === 0 ? 2 : 8;
    const columns = [];
    for (let high = firstColumn; high <= 0xF; high += 1) columns.push(high.toString(16).toUpperCase());
    lines.push(`PAGE ${definition.id} ${definition.name}`, `   ${columns.join(" ")}`);
    for (let low = 0; low <= 0xF; low += 1) {
      const cells = [];
      for (let high = firstColumn; high <= 0xF; high += 1) {
        const codepoint = mapping.get(high * 0x10 + low);
        cells.push(codepoint == null || codepoint < 0x20 || codepoint === 0x7F
          ? " " : String.fromCodePoint(codepoint));
      }
      lines.push(`@text ${low.toString(16).toUpperCase()}  | @code-page ${definition.id} | @text ${cells.join(" ")} | @line`);
    }
    lines.push("");
  }
  lines.push("@fi", "");
  return lines.join("\n");
}

async function atomicWrite(path, content) {
  const temporary = `${path}.generate-${process.pid}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

async function main() {
  if (!inputRoot) throw new Error("usage: generate_standard_pages.mjs MAPPING_DIRECTORY");
  const sourceCache = new Map();
  const loaded = [];
  for (const definition of definitions) {
    let source = sourceCache.get(definition.input);
    if (!source) {
      const bytes = await readFile(join(inputRoot, definition.input));
      if (digest(bytes) !== definition.sha256) throw new Error(`unexpected ${basename(definition.input)} digest`);
      source = bytes.toString("utf8");
      sourceCache.set(definition.input, source);
    }
    const mapping = parseMapping(source);
    for (const [byte, codepoint] of Object.entries(definition.replacements ?? {})) {
      mapping.set(Number(byte), codepoint);
    }
    loaded.push({ definition, mapping });
    await atomicWrite(join(projectRoot, "src/tm_u220/charset/pages", definition.output),
      renderPage(definition, mapping));
  }
  await atomicWrite(join(projectRoot, "examples/chars.txt"), renderSpecimen(loaded));
}

main().catch((error) => {
  process.stderr.write(`generate standard pages: ${error.message}\n`);
  process.exitCode = 1;
});
