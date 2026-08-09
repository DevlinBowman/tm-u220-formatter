// Renders canonical PC437 page-byte selections in stable semantic groups.
// Authored, draft, and selection markers remain presentation state owned by the caller.
const GROUPS = Object.freeze([
  { label: "Space & punctuation", first: 0x20, last: 0x2f },
  { label: "Numbers & marks", first: 0x30, last: 0x3f },
  { label: "Uppercase & marks", first: 0x40, last: 0x5f },
  { label: "Lowercase & marks", first: 0x60, last: 0x7e },
  { label: "Accents & currency", first: 0x80, last: 0xaf },
  { label: "Lines & blocks", first: 0xb0, last: 0xdf },
  { label: "Greek & mathematics", first: 0xe0, last: 0xff },
]);

export function byteHex(byte) {
  return Number(byte).toString(16).toUpperCase().padStart(2, "0");
}

export function unicodeCode(character) {
  return `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

export function glyphLabel(glyph) {
  if (glyph.byte === 0x20) return "SP";
  if (glyph.byte === 0xff) return "NBSP";
  return glyph.character;
}

export function glyphName(glyph) {
  if (glyph.byte === 0x20) return "Space";
  if (glyph.byte === 0xff) return "Non-breaking space";
  return glyph.character;
}

function identity(page, byte) { return `${page}:${byte}`; }

function groupedCatalog(catalog) {
  const seen = new Set();
  const glyphs = catalog.map((glyph) => {
    const value = {
      page: Number(glyph?.page), byte: Number(glyph?.byte),
      character: glyph?.character,
    };
    const key = identity(value.page, value.byte);
    if (value.page !== 0 || !Number.isInteger(value.byte)
      || [...String(value.character ?? "")].length !== 1 || seen.has(key)) {
      throw new TypeError("invalid glyph catalog descriptor");
    }
    seen.add(key);
    return value;
  });
  const groups = GROUPS.map((group) => ({ ...group,
    glyphs: glyphs.filter((glyph) => glyph.byte >= group.first
      && glyph.byte <= group.last),
  }));
  if (groups.reduce((count, group) => count + group.glyphs.length, 0)
      !== glyphs.length || groups.some((group) => !group.glyphs.length)) {
    throw new TypeError("glyph catalog is outside the organized PC437 ranges");
  }
  return groups;
}

function buttonFor(glyph) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "glyph-button";
  button.dataset.page = String(glyph.page);
  button.dataset.byte = String(glyph.byte);
  button.setAttribute("role", "option");
  button.textContent = glyphLabel(glyph);
  return button;
}

export function createGlyphCatalog(root, catalog, onSelect) {
  const groups = groupedCatalog(catalog);
  const glyphByIdentity = new Map();
  const buttonByIdentity = new Map();
  const countByGroup = new Map();
  const sections = groups.map((group) => {
    const section = document.createElement("section");
    const heading = document.createElement("div");
    const title = document.createElement("strong");
    const count = document.createElement("small");
    const grid = document.createElement("div");
    section.className = "glyph-group";
    section.setAttribute("role", "group");
    section.setAttribute("aria-label", group.label);
    heading.className = "glyph-group-heading";
    title.textContent = group.label;
    count.className = "glyph-group-count";
    grid.className = "glyph-group-grid";
    heading.append(title, count);
    for (const glyph of group.glyphs) {
      const key = identity(glyph.page, glyph.byte);
      const button = buttonFor(glyph);
      glyphByIdentity.set(key, glyph);
      buttonByIdentity.set(key, button);
      grid.append(button);
    }
    countByGroup.set(group, count);
    section.append(heading, grid);
    return section;
  });
  root.replaceChildren(...sections);
  root.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-byte]");
    if (!button || !root.contains(button)) return;
    const glyph = glyphByIdentity.get(identity(
      Number(button.dataset.page), Number(button.dataset.byte)));
    if (glyph) onSelect(glyph);
  });

  return {
    render({ selected, dirtyBytes, authoredBytes }) {
      for (const [key, button] of buttonByIdentity) {
        const glyph = glyphByIdentity.get(key);
        const selectedHere = selected.page === glyph.page
          && selected.byte === glyph.byte;
        const dirty = dirtyBytes.has(glyph.byte);
        const authored = authoredBytes.has(glyph.byte);
        const state = authored ? "Authored mask" : "Unauthored blank mask";
        button.dataset.dirty = String(dirty);
        button.dataset.authored = String(authored);
        button.setAttribute("aria-selected", String(selectedHere));
        button.setAttribute("aria-label",
          `${glyphName(glyph)}, PC437 ${byteHex(glyph.byte)}, ${unicodeCode(glyph.character)}, ${state}`);
        button.title = `PC437 0x${byteHex(glyph.byte)} · ${unicodeCode(glyph.character)} · ${state}`;
      }
      for (const group of groups) {
        const authored = group.glyphs.filter(
          (glyph) => authoredBytes.has(glyph.byte)).length;
        countByGroup.get(group).textContent = `${authored}/${group.glyphs.length} authored`;
      }
    },
  };
}
