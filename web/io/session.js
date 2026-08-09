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
    name: session.name || "untitled.u220",
    plain: Boolean(session.plain),
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
