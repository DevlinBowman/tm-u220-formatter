#!/usr/bin/env node
// Starts the checkout-only loopback workspace for glyph editing and receipt preview.
// Glyph writes stay fixed-target while ordinary preview routes retain their own services.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GLYPH_SERVER_USAGE, parseGlyphServerConfig } from "./config.mjs";
import { AppearanceStore } from "./appearance-store.mjs";
import { GlyphPatternStore } from "./pattern-store.mjs";
import { createDevelopmentRouter } from "./router.mjs";
import { EditorDocument } from "../../../web/server/document.mjs";

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(serverDirectory, "../../..");
const glyphRoot = resolve(serverDirectory, "..");

async function main() {
  const config = await parseGlyphServerConfig(
    process.argv.slice(2), projectRoot);
  if (config.help) {
    process.stdout.write(GLYPH_SERVER_USAGE);
    return;
  }
  const store = new GlyphPatternStore({
    a: resolve(projectRoot, "web/preview/printer-font/resident/font-a.js"),
    b: resolve(projectRoot, "web/preview/printer-font/resident/font-b.js"),
  });
  const appearanceStore = new AppearanceStore(resolve(projectRoot,
    "web/preview/printer-font/appearance.js"));
  await Promise.all([store.read(), appearanceStore.read()]);
  const document = new EditorDocument(config.target, config.plain);
  let address;
  const origin = () => address
    ? `http://${config.host}:${address.port}` : `http://${config.host}`;
  const server = createServer(createDevelopmentRouter({
    glyphStore: store,
    appearanceStore,
    publicRoot: resolve(glyphRoot, "public"),
    webRoot: resolve(projectRoot, "web"),
    webStyles: resolve(projectRoot, "web/styles"),
    origin,
    previewConfig: config,
    previewDocument: document,
  }));
  server.on("error", (error) => {
    process.stderr.write(`glyph editor: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    address = server.address();
    const url = `${origin()}/glyphs/`;
    process.stdout.write(`TM-U220 glyph editor: ${url}\n`);
    process.stdout.write("Press Ctrl+C here when you are finished.\n");
    if (config.open) {
      const opener = spawn("open", [url], { detached: true, stdio: "ignore" });
      opener.unref();
    }
  });
}

main().catch((error) => {
  process.stderr.write(`glyph editor: ${error.message}\n`);
  process.exitCode = 1;
});
