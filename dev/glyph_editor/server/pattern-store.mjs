// Provides atomic, fixed-target persistence for the two web-preview font sources.
// Callers may select a font and glyph but can never supply or derive a filesystem path.
import { readFile } from "node:fs/promises";
import { atomicSourceWrite } from "./atomic-source.mjs";
import {
  FONT_DIMENSIONS,
  parsePatternSource,
  replacePatternSource,
} from "./pattern-source.mjs";

export class GlyphPatternStore {
  constructor(paths) {
    this.paths = Object.freeze({ a: paths.a, b: paths.b });
    this.queue = Promise.resolve();
  }

  async read() {
    const fonts = {};
    await Promise.all(Object.entries(this.paths).map(async ([font, path]) => {
      const dimensions = FONT_DIMENSIONS[font];
      const parsed = parsePatternSource(await readFile(path, "utf8"),
        dimensions.width, dimensions.height);
      fonts[font] = { ...dimensions, patterns: parsed.patterns };
    }));
    return { fonts };
  }

  save(glyph) {
    const operation = this.queue.then(() => this.saveNow(glyph));
    this.queue = operation.catch(() => {});
    return operation;
  }

  async saveNow(glyph) {
    const dimensions = FONT_DIMENSIONS[glyph?.font];
    const path = this.paths[glyph?.font];
    if (!dimensions || !path) {
      throw Object.assign(new Error("font must be A or B"), { status: 400 });
    }
    const source = await readFile(path, "utf8");
    const updated = replacePatternSource(source, {
      character: glyph.character,
      pattern: glyph.pattern,
      previousPattern: glyph.previousPattern,
      ...dimensions,
    });
    await atomicSourceWrite(path, updated);
    return { saved: true, font: glyph.font, character: glyph.character,
      pattern: glyph.pattern };
  }
}
