// Exposes canonical page-0 byte descriptors shared by browser preview and developer tooling.
// Generated from pinned Unicode mapping data; see THIRD_PARTY_NOTICES.md.
const PAGE_RANGES = Object.freeze([
  Object.freeze([0x20, " !\"#$%&'()*+,-./"]),
  Object.freeze([0x30, "0123456789:;<=>?"]),
  Object.freeze([0x40, "@ABCDEFGHIJKLMNO"]),
  Object.freeze([0x50, "PQRSTUVWXYZ[\\]^_"]),
  Object.freeze([0x60, "`abcdefghijklmno"]),
  Object.freeze([0x70, "pqrstuvwxyz{|}~"]),
  Object.freeze([0x80, "ÇüéâäàåçêëèïîìÄÅ"]),
  Object.freeze([0x90, "ÉæÆôöòûùÿÖÜ¢£¥₧ƒ"]),
  Object.freeze([0xA0, "áíóúñÑªº¿⌐¬½¼¡«»"]),
  Object.freeze([0xB0, "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐"]),
  Object.freeze([0xC0, "└┴┬├─┼╞╟╚╔╩╦╠═╬╧"]),
  Object.freeze([0xD0, "╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀"]),
  Object.freeze([0xE0, "αßΓπΣσµτΦΘΩδ∞φε∩"]),
  Object.freeze([0xF0, "≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00A0"]),
]);

export const PC437_TEXT_GLYPHS = Object.freeze(PAGE_RANGES.flatMap(
  ([start, characters]) => [...characters].map((character, index) =>
    Object.freeze({ page: 0, byte: start + index, character })),
));
