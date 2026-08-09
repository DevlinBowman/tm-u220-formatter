// Atomically replaces one already-resolved development source file while preserving its mode.
// Feature stores own the fixed path; this helper never accepts browser-supplied path data.
import { randomUUID } from "node:crypto";
import { rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function atomicSourceWrite(path, source) {
  const metadata = await stat(path);
  const temporary = join(dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, source, {
      encoding: "utf8", flag: "wx", mode: metadata.mode & 0o777,
    });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
