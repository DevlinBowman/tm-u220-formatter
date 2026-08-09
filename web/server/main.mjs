#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfig } from "./config.mjs";
import { EditorDocument } from "./document.mjs";
import { createRouter } from "./router.mjs";

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(serverDirectory, "../..");

async function main() {
  const config = await parseConfig(process.argv.slice(2), root);
  const document = new EditorDocument(config.target, config.plain);
  let address;
  const origin = () => address ? `http://${config.host}:${address.port}` : "http://127.0.0.1";
  const server = createServer(createRouter({
    config,
    document,
    webRoot: resolve(root, "web"),
    origin,
  }));
  server.on("error", (error) => {
    process.stderr.write(`220 preview: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    address = server.address();
    const url = origin();
    process.stdout.write(`TM-U220 preview: ${url}\n`);
    process.stdout.write("Press Ctrl+C here when you are finished.\n");
    if (config.open) {
      const opener = spawn("open", [url], { detached: true, stdio: "ignore" });
      opener.unref();
    }
  });
}

main().catch((error) => {
  process.stderr.write(`220 preview: ${error.message}\n`);
  process.exitCode = 1;
});
