# Specification sources

The device model is an independent implementation based on the linked public
references. Vendor documents are linked rather than redistributed; licensing
and generation details are recorded in [provenance](PROVENANCE.md).

- [TM-U220 Technical Reference Guide, Revision I](https://download4.epson.biz/sec_pubs/bs/pdf/TM-U220_std_trg_en_revI.pdf)
- [Epson ESC/POS command reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/index.html)
- [TM-U220 supported command list](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/tmu220.html)
- [ESC `SP` - Set right-side character spacing](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_space.html)
- [ESC `!` - Select print modes](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_exclamation.html)
- [ESC `&` - Define user-defined characters](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_ampersand.html)
- [ESC `*` - Select bit-image mode](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_asterisk.html)
- [ESC `-` - Turn underline mode on/off](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_minus.html)
- [ESC `3` - Set line spacing](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_3.html)
- [ESC `J` - Print and feed paper](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_cj.html)
- [ESC `U` - Turn unidirectional print mode on/off](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_cu.html)
- [ESC `a` - Select justification](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_la.html)
- [ESC `{` — Turn upside-down print mode on/off](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lbrace.html)
- [GS I — Transmit printer ID](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_ci.html)
- [DLE EOT — Transmit real-time status](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/dle_eot.html)
- [GS r — Transmit paper-sensor status](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lr.html)
- [GS a — Enable/disable Automatic Status Back](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_la.html)
- [Unicode PC code-page mappings](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/)
- [Unicode Windows-1252 mapping](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1252.TXT)

## Initial profile facts

- The TM-U220 is a 9-pin serial impact dot-matrix printer.
- Types A and B have an autocutter; Type A also has a take-up device. Type D has
  no autocutter.
- Type A uses 76 mm paper. Types B and D support 76, 69.5, and 57.5 mm paper.
- Printable width is 400/385 half-dot positions on 76 mm paper depending on DIP
  switch 2-1, 360 positions on 69.5 mm paper, and 300/297 positions on 57.5 mm.
- Font B is the default 7 x 9 resident matrix. Font A is 9 x 9. DIP 2-1 supplies
  an irreducible two- or three-half-dot ANK gap; `ESC SP` adds spacing beyond
  that gap. This yields 40 Font B or 33 Font A columns on 76 mm paper with the
  switch off, even when added spacing is zero.
- Default line spacing is 1/6 inch. Paper-feed commands use 1/144-inch units.
- Horizontal positioning uses 1/160-inch half-dot units. The nine physical pin
  rows are spaced at 1/72 inch, or two vertical motion units.
- `ESC *` exposes the TM-U220 printhead as eight-row column data. Mode 0 prints
  at 80 x 72 dpi and permits adjacent horizontal dots; mode 1 prints at
  160 x 72 dpi and prohibits them. Depending on paper width and DIP 2-1, the
  maximum supported row width is 148-200 dots in mode 0 or 297-400 dots in
  mode 1. Multi-band calibration uses `ESC U` to compare bidirectional and
  unidirectional registration.
- TM-U220 user-defined character rows cannot print horizontally adjoining
  positions. That command restriction does not describe the resident ROM:
  magnified observations of project-authored physical printouts show resident
  strokes using adjacent half-dot positions. Wide mode remains the printer's
  separate 2×1 expansion.
- For this model, both supported nonzero `ESC -` values select a one-dot-thick
  underline. The job format retains `single` and `double` so their distinct
  command bytes round-trip, but the physical preview shows one strike row.
- All distributed byte-to-Unicode mappings are generated from the pinned,
  Unicode-licensed inputs recorded in the third-party notices. Preview glyphs
  are representative authoring assets rather than printer ROM data; see the
  provenance record before redistributing the strike atlases.
- Type A/B cutting shape is a hardware/dealer configuration. The full/partial
  selector byte does not necessarily change the installed physical cut shape.

The command registry is limited to the TM-U220 supported-command list.
Ambiguous or model-dependent behavior remains unsupported until represented as
an explicit profile setting and covered by fixtures. See
[printer settings discovery](printer-settings.md) for the strict query boundary.
