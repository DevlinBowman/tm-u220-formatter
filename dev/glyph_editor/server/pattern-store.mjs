// Provides atomic, fixed-target persistence for base ASCII and sparse extended PC437 masks.
// Browser requests identify canonical page bytes but can never supply or derive a filesystem path.
import { readFile } from "node:fs/promises";
import { PC437_TEXT_GLYPHS } from "../../../web/charset/page-00-pc437.js";
import { atomicSourceWrite } from "./atomic-source.mjs";
import {
  parsePagePatternSource,
  replacePagePatternSource,
} from "./page-pattern-source.mjs";
import {
  FONT_DIMENSIONS,
  parsePatternSource,
  replacePatternSource,
  validatePattern,
} from "./pattern-source.mjs";

const PAGE = 0;
const BASE_LAST_BYTE = 0x7E;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function fixedPaths(paths) {
  return Object.freeze(Object.fromEntries(["a", "b"].map((font) => [
    font,
    Object.freeze({
      ascii: paths[font]?.ascii,
      extended: paths[font]?.extended,
    }),
  ])));
}

function catalogIndex(catalog) {
  const byByte = new Map();
  for (const descriptor of catalog) {
    if (descriptor.page !== PAGE || byByte.has(descriptor.byte)) {
      throw new Error("PC437 catalog needs unique page-0 byte descriptors");
    }
    byByte.set(descriptor.byte, descriptor);
  }
  return byByte;
}

function authoredFont(catalog, base, extended, dimensions) {
  const patterns = {};
  const authoredBytes = [];
  for (const descriptor of catalog) {
    const pattern = descriptor.byte <= BASE_LAST_BYTE
      ? base.patterns[descriptor.character]
      : extended.patterns[descriptor.byte];
    if (pattern === undefined) continue;
    patterns[descriptor.byte] = pattern;
    authoredBytes.push(descriptor.byte);
  }
  return { ...dimensions, patterns, authoredBytes };
}

export class GlyphPatternStore {
  constructor(paths) {
    this.paths = fixedPaths(paths);
    this.catalog = PC437_TEXT_GLYPHS;
    this.descriptors = catalogIndex(this.catalog);
    this.extendedBytes = new Set(this.catalog
      .filter(({ byte }) => byte > BASE_LAST_BYTE)
      .map(({ byte }) => byte));
    this.queue = Promise.resolve();
  }

  async readFont(font) {
    const dimensions = FONT_DIMENSIONS[font];
    const paths = this.paths[font];
    const [asciiSource, extendedSource] = await Promise.all([
      readFile(paths.ascii, "utf8"),
      readFile(paths.extended, "utf8"),
    ]);
    const base = parsePatternSource(asciiSource,
      dimensions.width, dimensions.height);
    const extended = parsePagePatternSource(extendedSource, {
      allowedBytes: this.extendedBytes,
      width: dimensions.width,
      height: dimensions.height,
    });
    return authoredFont(this.catalog, base, extended, dimensions);
  }

  async read() {
    const [a, b] = await Promise.all([
      this.readFont("a"), this.readFont("b"),
    ]);
    return { catalog: this.catalog, fonts: { a, b } };
  }

  save(glyph) {
    const operation = this.queue.then(() => this.saveNow(glyph));
    this.queue = operation.catch(() => {});
    return operation;
  }

  async saveNow(glyph) {
    const font = glyph?.font;
    const dimensions = FONT_DIMENSIONS[font];
    const paths = this.paths[font];
    if (!dimensions || !paths?.ascii || !paths?.extended) {
      throw badRequest("font must be A or B");
    }
    if (glyph.page !== PAGE) throw badRequest("page must be 0 (PC437)");
    if (!Number.isInteger(glyph.byte) || !this.descriptors.has(glyph.byte)) {
      throw badRequest("byte must identify a selectable PC437 glyph");
    }
    if (glyph.previousPattern === undefined) {
      throw badRequest("previousPattern is required for conflict-safe saving");
    }
    validatePattern(glyph.previousPattern, dimensions.width, dimensions.height);

    const descriptor = this.descriptors.get(glyph.byte);
    const extended = glyph.byte > BASE_LAST_BYTE;
    const path = extended ? paths.extended : paths.ascii;
    const source = await readFile(path, "utf8");
    const options = {
      pattern: glyph.pattern,
      previousPattern: glyph.previousPattern,
      ...dimensions,
    };
    const updated = extended
      ? replacePagePatternSource(source, {
        ...options, byte: glyph.byte, allowedBytes: this.extendedBytes,
      })
      : replacePatternSource(source, {
        ...options, character: descriptor.character,
      });
    await atomicSourceWrite(path, updated);
    return {
      saved: true,
      font,
      page: PAGE,
      byte: glyph.byte,
      pattern: glyph.pattern,
    };
  }
}
