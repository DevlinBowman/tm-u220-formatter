// Owns fixed-target persistence for preview-wide single and double-strike dot sizes.
// Serialized writes reject stale browser state and never modify per-glyph definitions.
import { readFile } from "node:fs/promises";
import { atomicSourceWrite } from "./atomic-source.mjs";
import {
  parseAppearanceSource,
  replaceAppearanceSource,
} from "./appearance-source.mjs";

export class AppearanceStore {
  constructor(path) {
    this.path = path;
    this.queue = Promise.resolve();
  }

  async read() {
    return parseAppearanceSource(await readFile(this.path, "utf8"));
  }

  save(request) {
    const operation = this.queue.then(() => this.saveNow(request));
    this.queue = operation.catch(() => {});
    return operation;
  }

  async saveNow(request) {
    const source = await readFile(this.path, "utf8");
    const updated = replaceAppearanceSource(
      source, request?.value, request?.previous);
    await atomicSourceWrite(this.path, updated);
    return { saved: true, value: parseAppearanceSource(updated) };
  }
}
