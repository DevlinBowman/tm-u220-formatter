// Composes glyph development and the ordinary receipt preview on one loopback origin.
// Atlas/appearance writes and receipt APIs remain independently routed to their owning stores.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRouter as createPreviewRouter } from "../../../web/server/router.mjs";
import { sendStatic } from "../../../web/server/http_helpers.mjs";
import {
  readJson,
  redirect,
  sendFile,
  sendJson,
  sendText,
} from "./http.mjs";

const GLYPH_FILES = new Set([
  "app.js", "api.js", "appearance-model.js", "appearance.css",
    "catalog.js", "font-guides.js", "geometry.css", "grid.js", "model.js",
    "preview.js", "save-action.js", "study-text.js", "styles.css",
]);

function sameOrigin(request, origin) {
  if (request.headers.origin && request.headers.origin !== origin()) {
    throw Object.assign(new Error("save origin is not allowed"), { status: 403 });
  }
}

async function previewIndex(webRoot) {
  const source = await readFile(join(webRoot, "index.html"), "utf8");
  const anchor = '<nav class="file-actions" aria-label="File actions">';
  const link = '\n        <a class="button button-secondary" href="/glyphs/">Glyph editor</a>';
  if (!source.includes(anchor)) throw new Error("preview navigation anchor is unavailable");
  return source.replace(anchor, anchor + link);
}

export function createDevelopmentRouter(options) {
  const { glyphStore, appearanceStore, publicRoot, webRoot, webStyles,
    origin, previewConfig, previewDocument } = options;
  const previewRouter = createPreviewRouter({
    config: previewConfig,
    document: previewDocument,
    webRoot,
    origin,
  });

  return async (request, response) => {
    const url = new URL(request.url, origin());
    try {
      if (request.method === "GET" && url.pathname === "/api/glyphs") {
        return sendJson(response, 200, await glyphStore.read());
      }
      if (request.method === "PUT" && url.pathname === "/api/glyph") {
        sameOrigin(request, origin);
        return sendJson(response, 200,
          await glyphStore.save(await readJson(request)));
      }
      if (request.method === "GET" && url.pathname === "/api/appearance") {
        return sendJson(response, 200, await appearanceStore.read());
      }
      if (request.method === "PUT" && url.pathname === "/api/appearance") {
        sameOrigin(request, origin);
        return sendJson(response, 200,
          await appearanceStore.save(await readJson(request)));
      }
      if (url.pathname.startsWith("/api/")) {
        return previewRouter(request, response);
      }
      if (request.method === "GET" && url.pathname === "/") {
        return redirect(response, "/glyphs/");
      }
      if (request.method === "GET" && url.pathname === "/glyphs") {
        return redirect(response, "/glyphs/");
      }
      if (request.method === "GET" && url.pathname === "/preview") {
        return redirect(response, "/preview/");
      }
      const asset = {
        "/assets/tokens.css": join(webStyles, "tokens.css"),
        "/assets/shell.css": join(webStyles, "shell.css"),
      }[url.pathname];
      if (request.method === "GET" && asset && await sendFile(response, asset)) return;
      if (request.method === "GET" && url.pathname === "/glyphs/") {
        if (await sendFile(response, join(publicRoot, "index.html"))) return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/glyphs/")) {
        const relative = url.pathname.slice("/glyphs/".length);
        if (GLYPH_FILES.has(relative)
          && await sendFile(response, join(publicRoot, relative))) return;
      }
      if (request.method === "GET" && url.pathname === "/preview/") {
        return sendText(response, 200, await previewIndex(webRoot));
      }
      if (request.method === "GET" && url.pathname.startsWith("/preview/")) {
        const pathname = `/${url.pathname.slice("/preview/".length)}`;
        if (await sendStatic(response, webRoot, pathname)) return;
      }
      sendJson(response, 404, { error: "not found" });
    } catch (error) {
      sendJson(response, error.status || 500,
        { error: error.message || "internal error" });
    }
  };
}
