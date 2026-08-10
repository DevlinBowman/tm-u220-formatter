// Talks only to the image-profile editor's fixed session, preview, and profile endpoints.
// Source-image bytes and printer actions are intentionally absent from this browser boundary.
async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `request failed (${response.status})`);
  return body;
}

export async function loadImageProfileSession() {
  return responseJson(await fetch("/api/session", {
    headers: { Accept: "application/json" },
  }));
}

export async function compileImageProfile(source, signal) {
  return responseJson(await fetch("/api/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ source }), signal,
  }));
}

export async function saveImageProfile(source, revision) {
  return responseJson(await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ source, revision }),
  }));
}
