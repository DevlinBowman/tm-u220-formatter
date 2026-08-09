import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const BODY_LIMIT = 1024 * 1024;
const TYPES = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".woff2": "font/woff2" };

export function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  response.end(body);
}

export async function readJson(request) {
  if (!String(request.headers["content-type"] || "").startsWith("application/json")) {
    throw Object.assign(new Error("content type must be application/json"), { status: 415 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw Object.assign(new Error("request is too large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("request contains invalid JSON"), { status: 400 }); }
}

export async function sendStatic(response, webRoot, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = resolve(webRoot, relative);
  const allowedRoot = resolve(webRoot) + sep;
  const privatePath = relative.startsWith("server/") || relative.startsWith("test/");
  if (!path.startsWith(allowedRoot) || privatePath || !TYPES[extname(path)]) return false;
  try {
    const body = await readFile(path);
    response.writeHead(200, { "Content-Type": `${TYPES[extname(path)]}; charset=utf-8`,
      "Content-Length": body.length, "Cache-Control": "no-store" });
    response.end(body);
    return true;
  } catch { return false; }
}
