#!/usr/bin/env node
// Starts the private image-profile workspace for one fixed source image and editable profile.
// It exposes compilation and profile persistence only; no route can submit printer output.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EditorDocument } from "../../web/server/document.mjs";
import { parseEditorConfig } from "./config.mjs";
import { ImageProfileStore } from "./profile_store.mjs";
import { createImageProfileRouter } from "./router.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../..");

async function main() {
  const config = await parseEditorConfig(process.argv.slice(2), root);
  const image = await EditorDocument.open(config.target, false);
  if (!image.immutable) {
    throw new Error("image-profile editor requires a PNG, JPEG, or binary PBM image");
  }
  const store = new ImageProfileStore(config.imageProfile, root);
  await store.read();
  let address;
  const origin = () => address
    ? `http://${config.host}:${address.port}` : `http://${config.host}`;
  const server = createServer(createImageProfileRouter({
    config, store, origin,
    editorRoot: resolve(root, "web/image_profile_editor"),
    webRoot: resolve(root, "web"),
  }));
  server.on("error", (error) => {
    process.stderr.write(`220 image-profile: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    address = server.address();
    const url = `${origin()}/image-profile/`;
    process.stdout.write(`TM-U220 image profile: ${url}\n`);
    process.stdout.write("Press Ctrl+C here when you are finished.\n");
    if (config.open) {
      const opener = spawn("open", [url], { detached: true, stdio: "ignore" });
      opener.unref();
    }
  });
}

main().catch((error) => {
  process.stderr.write(`220 image-profile: ${error.message}\n`);
  process.exitCode = 1;
});
