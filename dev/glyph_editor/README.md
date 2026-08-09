# Preview glyph editor

Run the checkout-only development command from the repository root:

```sh
./bin/tm-u220 dev glyphs
```

The loopback web workspace links the glyph editor and the ordinary receipt
preview on one server. Pass an optional receipt file to use it in the preview;
otherwise `examples/plain_receipt.u220` opens. **Update glyph** or Command-S
(Control-S on non-macOS keyboards) atomically updates only the selected Font
A/B page-0 byte. Printable ASCII remains in `font-a.js` and `font-b.js`; authored
extended PC437 masks are kept in separate sparse page-0 extension files.

The catalog exposes the 223 text-producing PC437 bytes in semantic groups:
printable ASCII `20–7E` and extended bytes `80–FF`. C0 controls and `7F` remain
printer operations, not editable text glyphs. Unicode characters are display
labels; selection, drafts, conflict checks, and saves retain canonical page and
byte identity. Extended slots stay visibly unauthored until explicitly saved,
so an empty catalog slot never replaces the receipt preview's browser-backed
representative by accident.

Each glyph column is a horizontal 1/160-inch half-dot position containing a
full pin impact, not a partial dot. Glyph height remains nine fixed 1/72-inch
pin rows; the printer's finer vertical paper-feed unit is not an editable glyph
slot. Every row and column remains usable mask data. The editor draws a
development authoring baseline after pin 7 for both fonts and separately marks
Epson's matrix-bottom alignment edge after pin 9. Epson defines no internal
baseline for these fonts; our guide is a reconstruction convention, and neither
guide is saved or printed.

The receipt study always shows the selected glyph beside user-entered PC437
comparison text. It keeps the printer's two- or three-half-dot-position base
character spacing outside the mask and also shows the part of the default line
spacing below the matrix. The editor owns two global receipt-ink
diameters for single and double-strike text in
`web/preview/printer-font/appearance.js`; these are rendering values rather
than character data. Compiler geometry, code pages, profiles, printer bytes,
and printing are not editable from the glyph APIs.

The direct `./dev/glyphs` interface retains the optional receipt, profile, text,
browser-opening, and port controls. Use `./dev/glyphs --no-open --port 0` when
another process will open the printed URL. Stop the command with Ctrl-C.
