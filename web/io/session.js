// Adapts the loopback server session into browser document state and persistence calls.
// Immutable direct-image metadata stays explicit so UI text cannot become printer input.
export const hasHttpSession = location.protocol === "http:" || location.protocol === "https:";

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body;
  throw new Error(body.message || body.error || `Request failed (${response.status})`);
}

export async function loadSession() {
  if (!hasHttpSession) return null;
  const response = await fetch("/api/session", { headers: { Accept: "application/json" } });
  if (response.status === 404) return null;
  const session = await responseJson(response);
  return {
    source: typeof session.source === "string" ? session.source : "",
    displaySource: typeof session.display_source === "string"
      ? session.display_source : undefined,
    name: session.name || "untitled.u220",
    plain: Boolean(session.plain),
    immutable: Boolean(session.immutable),
    inputKind: session.input_kind || "document",
  };
}

export async function saveSession(source) {
  const response = await fetch("/api/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ source }),
  });
  return responseJson(response);
}
