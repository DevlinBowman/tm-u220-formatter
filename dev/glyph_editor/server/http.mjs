// Supplies bounded JSON and fixed-file responses for the loopback glyph editor.
// It intentionally omits the ordinary preview server's document and compiler facilities.
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const BODY_LIMIT = 16 * 1024;
const TYPES = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript" };

export function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

export function sendText(response, status, body, type = "text/html") {
  response.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

export function redirect(response, location) {
  response.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  response.end();
}

export async function readJson(request) {
  if (!String(request.headers["content-type"] || "").startsWith("application/json")) {
    throw Object.assign(new Error("content type must be application/json"),
      { status: 415 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      throw Object.assign(new Error("request is too large"), { status: 413 });
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("request contains invalid JSON"), { status: 400 }); }
}

export async function sendFile(response, path) {
  try {
    const body = await readFile(path);
    const type = TYPES[extname(path)];
    if (!type) return false;
    response.writeHead(200, {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    response.end(body);
    return true;
  } catch { return false; }
}
