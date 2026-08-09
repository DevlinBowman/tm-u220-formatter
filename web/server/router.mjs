import { compileBuffer } from "./compiler.mjs";
import { readJson, sendJson, sendStatic } from "./http_helpers.mjs";

function sourceBody(body) {
  if (!body || typeof body.source !== "string") {
    throw Object.assign(new Error("source must be a string"), { status: 400 });
  }
  return body.source;
}

export function createRouter({ config, document, webRoot, origin }) {
  return async (request, response) => {
    const url = new URL(request.url, origin());
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/api/session") {
        return sendJson(response, 200, await document.read());
      }
      if (request.method === "POST" && url.pathname === "/api/preview") {
        const body = await readJson(request);
        const source = sourceBody(body);
        const plain = typeof body.plain === "boolean" ? body.plain : config.plain;
        return sendJson(response, 200, await compileBuffer(source, { ...config, plain }));
      }
      if (request.method === "PUT" && url.pathname === "/api/file") {
        if (request.headers.origin && request.headers.origin !== origin()) {
          throw Object.assign(new Error("save origin is not allowed"), { status: 403 });
        }
        return sendJson(response, 200, await document.save(sourceBody(await readJson(request))));
      }
      if (request.method === "GET" && await sendStatic(response, webRoot, url.pathname)) return;
      sendJson(response, 404, { error: "not found" });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message || "internal error" });
    }
  };
}
