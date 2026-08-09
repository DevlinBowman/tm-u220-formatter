import { hasHttpSession } from "../io/session.js";

export class PreviewUnavailableError extends Error {}

async function remoteCompile(source, plain, signal) {
  const response = await fetch("/api/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ source, plain }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Preview failed (${response.status})`);
  return body;
}

export async function compilePreview(source, plain, signal) {
  const local = window.U220Preview?.compile;
  if (typeof local === "function") {
    return await local(source, { plain, signal });
  }
  if (hasHttpSession) return remoteCompile(source, plain, signal);
  throw new PreviewUnavailableError("No preview compiler is connected.");
}
