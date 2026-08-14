// Stores only explicit project-authored Font B masks for the extended PC437 byte range.
// Bytes absent from this sparse source deliberately retain the representative fallback layer.
const ENTRIES = [
  ["B0", "..#...#/#...#../..#...#/#...#../..#...#/#...#../..#...#/#...#../..#...#"],
  ["B2", "#######/#######/#######/#######/#######/#######/#######/#######/#######"],
  ["B3", "..#..../..#..../..#..../..#..../..#..../..#..../..#..../..#..../..#...."],
  ["B4", "..#..../..#..../..#..../..#..../#.#..../..#..../..#..../..#..../..#...."],
  ["B5", "..#..../..#..../..#..../###..../###..../..#..../..#..../..#..../..#...."],
];

export const FONT_B_PAGE_437_PATTERNS = Object.freeze(Object.fromEntries(ENTRIES));
