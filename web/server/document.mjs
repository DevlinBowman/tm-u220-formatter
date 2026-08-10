// Owns the fixed preview target and separates editable text documents from immutable images.
// Direct images expose descriptive UI text without ever treating that text as printer input.
import { constants } from "node:fs";
import { access, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);

function imageFormat(header) {
  if (header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return "png";
  if (header.subarray(0, JPEG_PREFIX.length).equals(JPEG_PREFIX)) return "jpeg";
  const separator = header[2];
  if (header[0] === 0x50 && header[1] === 0x34
      && (separator === 0x23 || separator === 0x20
        || (separator >= 0x09 && separator <= 0x0d))) return "pbm";
  return null;
}

async function targetImageFormat(path) {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(PNG_SIGNATURE.length);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    return imageFormat(header.subarray(0, bytesRead));
  } finally {
    await file.close();
  }
}

export class EditorDocument {
  constructor(path, plain, inputKind = "document") {
    this.path = path;
    this.plain = plain;
    this.inputKind = inputKind;
    this.immutable = inputKind === "image";
  }

  static async open(path, plain) {
    const format = await targetImageFormat(path);
    if (!format) await access(path, constants.W_OK);
    return new EditorDocument(path, format ? false : plain, format ? "image" : "document");
  }

  async read() {
    if (this.immutable) {
      const name = basename(this.path);
      return {
        source: "",
        display_source: [
          "Direct printer image",
          name,
          "",
          "The preview is compiled from the original image bytes.",
        ].join("\n"),
        name,
        plain: false,
        immutable: true,
        input_kind: this.inputKind,
      };
    }
    return {
      source: await readFile(this.path, "utf8"),
      name: basename(this.path),
      plain: this.plain,
    };
  }

  async save(source) {
    if (this.immutable) {
      throw Object.assign(new Error("direct image previews are read-only"), { status: 405 });
    }
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
