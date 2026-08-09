// Talks only to the checkout-only glyph server's narrow atlas read/write endpoints.
// Receipt documents and the ordinary preview compilation API are intentionally unreachable here.
async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `request failed (${response.status})`);
  return body;
}

export async function loadGlyphAtlas() {
  return responseJson(await fetch("/api/glyphs", {
    headers: { Accept: "application/json" },
  }));
}

export async function loadPreviewAppearance() {
  return responseJson(await fetch("/api/appearance", {
    headers: { Accept: "application/json" },
  }));
}

export async function saveGlyphPattern(glyph) {
  return responseJson(await fetch("/api/glyph", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(glyph),
  }));
}

export async function savePreviewAppearance(value, previous) {
  return responseJson(await fetch("/api/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ value, previous }),
  }));
}
