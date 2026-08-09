// Renders the canonical printable-ASCII atlas as a compact, selectable character list.
// Selection and dirty markers remain presentation concerns rather than glyph-model state.
function label(character) { return character === " " ? "SP" : character; }
const PRINTABLE_ASCII = Array.from(
  { length: 0x7f - 0x20 }, (_, index) => String.fromCharCode(0x20 + index),
).join("");

export function createGlyphCatalog(root, onSelect) {
  root.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-character]");
    if (button && root.contains(button)) onSelect(button.dataset.character);
  });

  return {
    render(patterns, selected, dirtyCharacters) {
      root.replaceChildren(...[...PRINTABLE_ASCII].map((character) => {
        if (!Object.hasOwn(patterns, character)) {
          throw new Error(`missing preview glyph ${JSON.stringify(character)}`);
        }
        const button = document.createElement("button");
        const code = character.charCodeAt(0);
        button.type = "button";
        button.className = "glyph-button";
        button.dataset.character = character;
        button.dataset.dirty = String(dirtyCharacters.has(character));
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(character === selected));
        button.title = `ASCII ${code} · 0x${code.toString(16).toUpperCase().padStart(2, "0")}`;
        button.textContent = label(character);
        return button;
      }));
    },
  };
}
