// Routes the fixed image-profile workspace without accepting filesystem paths or print actions.
// Drafts compile through the canonical worker, while only the preselected profile can be saved.
import path from "node:path";
import { compileProfile } from "./compiler.mjs";
import { createPreviewQueue } from "./preview_queue.mjs";
import { readJson, sendJson, sendStatic } from "../../web/server/http_helpers.mjs";

function sameOrigin(request, origin) {
  if (request.headers.origin && request.headers.origin !== origin()) {
    throw Object.assign(new Error("request origin is not allowed"), { status: 403 });
  }
}

function exactObject(body, names, message) {
  if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some((name) => !names.includes(name))) {
    throw Object.assign(new Error(message), { status: 400 });
  }
  return body;
}

function redirect(response, location) {
  response.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  response.end();
}

function connectionSignal(request, response) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => { if (!response.writableEnded) abort(); };
  request.once?.("aborted", abort);
  response.once?.("close", close);
  return {
    signal: controller.signal,
    cleanup() {
      request.off?.("aborted", abort);
      response.off?.("close", close);
    },
  };
}

async function editorAsset(response, root, pathname) {
  const relative = pathname === "/image-profile/"
    ? "/index.html" : `/${pathname.slice("/image-profile/".length)}`;
  return sendStatic(response, root, relative);
}

export function createImageProfileRouter(options) {
  const { config, editorRoot, origin, store, webRoot } = options;
  const preview = options.previewQueue
    || createPreviewQueue(options.compile || compileProfile);
  return async (request, response) => {
    const url = new URL(request.url, origin());
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/api/session") {
        const session = await store.read();
        return sendJson(response, 200, {
          ...session, image_name: path.basename(config.target),
        });
      }
      if (request.method === "POST" && url.pathname === "/api/preview") {
        sameOrigin(request, origin);
        const body = exactObject(await readJson(request), ["source"],
          "preview requires only profile source");
        if (typeof body.source !== "string") {
          throw Object.assign(new Error("profile source must be a string"), { status: 400 });
        }
        const connection = connectionSignal(request, response);
        try {
          const result = await preview.run(body.source, {
            root: config.root, image: config.target, profile: config.profile,
          }, connection.signal);
          return sendJson(response, 200, result);
        } finally { connection.cleanup(); }
      }
      if (request.method === "PUT" && url.pathname === "/api/profile") {
        sameOrigin(request, origin);
        const body = exactObject(await readJson(request), ["source", "revision"],
          "save requires only profile source and revision");
        return sendJson(response, 200, await store.save(body));
      }
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/image-profile")) {
        return redirect(response, "/image-profile/");
      }
      if (request.method === "GET" && url.pathname.startsWith("/image-profile/")
          && await editorAsset(response, editorRoot, url.pathname)) return;
      if (request.method === "GET"
          && (url.pathname.startsWith("/styles/") || url.pathname.startsWith("/preview/")
            || url.pathname.startsWith("/charset/"))
          && await sendStatic(response, webRoot, url.pathname)) return;
      sendJson(response, 404, { error: "not found" });
    } catch (error) {
      if (response.destroyed) return;
      sendJson(response, error.status || 500, {
        error: error.message || "internal error",
        ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}),
      });
    }
  };
}
