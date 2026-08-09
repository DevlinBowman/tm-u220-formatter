import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export class EditorDocument {
  constructor(path, plain) {
    this.path = path;
    this.plain = plain;
  }

  async read() {
    return {
      source: await readFile(this.path, "utf8"),
      name: basename(this.path),
      plain: this.plain,
    };
  }

  async save(source) {
    const metadata = await stat(this.path);
    const temporary = join(dirname(this.path), `.${basename(this.path)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, source, { encoding: "utf8", mode: metadata.mode });
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
    return { saved: true, bytes: Buffer.byteLength(source), name: basename(this.path) };
  }
}
