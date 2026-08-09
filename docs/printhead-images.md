# Printhead image pipeline

The printhead feature converts local artwork into physical TM-U220 strikes
without treating pixels as text glyphs. Image interpretation, raster fitting,
dithering, and hardware band packing remain separate from receipt text and
printer transport.

## Domain boundary

```text
local PBM/PNG --image profile--> grayscale/one-bit raster --> safe dot mask
                                                               |
                                                               v
                                                 eight-row ESC * bands
                                                               |
                                                               v
                                               normal compiler and transport
```

`tm_u220.printhead.grayscale` and `tm_u220.printhead.dot_mask` are the compact,
immutable formats exchanged across that boundary. Dot-mask rows use binary-PBM
MSB-first packing. No decoder imports printer commands or formatter state.

`tm_u220.printhead.bit_image` owns the TM-U220-specific conversion from a mask
into eight-row column bytes. Solid mode maps to `ESC *` mode 0 at 80 x 72 dpi
and permits adjacent strikes. Detail mode maps to mode 1 at 160 x 72 dpi and
rejects horizontally adjacent strikes. The selected paper and DIP profile can
narrow the hardware's global 200/400-column limits.

The `spec` registry knows how to encode and inspect `ESC *` and `ESC U`, but it
does not decide how source artwork becomes a dot mask. Application orchestration
converts authored character-cell boxes into physical dots, adds exact preview
metadata, and sends completed bands through the normal compiler checkpoints.

## Authoring

A file-backed job can place a local image on its own source line:

```text
@image "art/chicken.png" 20 10
@image marks/logo.pbm page auto
@image art/default-size.png
```

The path is relative to the job file. Unquoted paths cannot contain whitespace;
quoted paths accept only `\"` and `\\` escapes. Width is a positive number of
current character cells or `page`. Height is a positive number of current
character cells or `auto`. When the box is omitted, the active interpretation
profile supplies both values. `@image` requires the beginning of a printer line,
owns its source line, and is invalid inside tables or directive sequences.

`@image` is document syntax rather than a shell command. A quoted inline job is
also accepted by `check`, `render`, `compile`, and `print`; its relative image
paths are anchored to the directory where `220` was invoked:

```sh
220 render '@image "test/assets/Chicken.png" 20 10'
```

Standard input deliberately receives no implicit asset directory.

Supported image files are strict binary PBM (`P4`) and non-interlaced 8-bit PNG.
PNG grayscale, RGB, indexed-color, grayscale-alpha, and RGBA inputs are reduced
to luminance with transparency composited on white. JPEG is not decoded yet.

A PBM or PNG can also be the complete command input:

```sh
220 preview art/chicken.png
220 render art/chicken.png
220 compile art/chicken.png --hex
220 print art/chicken.png
```

Direct images use the profile's default full-page/automatic box. `220 preview`
opens an image as a read-only session and paints the exact final printer-dot
mask; image bytes never enter the source editor or its save path. Put `@image`
in a receipt when the image should be previewed alongside text.

## Interpretation profile

Image interpretation uses a separate versioned data profile rather than adding
artistic choices to the physical printer profile. The shipped file is
`config/images/default.u220i`; `220 config` opens its active editable copy.

```text
!tm-u220 image-profile 1
density=solid
fit=contain
resample=nearest
dither=threshold
threshold=128
invert=off
unidirectional=on
trailing_gap_vertical_units=4
default_width_cells=page
default_height_cells=auto
```

The fields own target size, contain/cover/stretch fitting, deterministic
nearest/area/bilinear resampling, threshold/ordered/Floyd dithering, inversion,
physical density, multi-band registration, and the deliberate post-image paper
gap. PNG transparency is composited on white before interpretation.

Solid density is the safe default at 80 x 72 dpi. Detail density uses
160 x 72 dpi and automatically prevents horizontally adjacent strikes before
the band packer independently validates the same hardware rule. Contain and
cover preserve physical aspect ratio despite the printer's asymmetric dot
density; stretch explicitly fills the authored box.

## Asset boundary

File-backed image paths are anchored to their document. Explicit inline CLI
jobs use the invocation directory, while standard input has no companion-file
base. A fixed helper anchors each reference to the selected safe base, rejects
absolute paths, traversal, links, and non-regular files, verifies that the
opened file stays unchanged while read, and enforces per-file and per-job byte
and pixel limits. Preview requests cannot supply or override that base.
Diagnostics retain only the authored reference, never a resolved local path.

The paper preview consumes the exact final dot mask emitted to the packer.
Multi-band output enables unidirectional printing when configured, follows each
eight-row band with the calibrated `ESC J 16`, and applies the profile's trailing
gap only after the final band.

## Hardware proof

The checkout-only calibration generator in `dev/bit_image_calibration` builds a
deterministic stream through the canonical mask, band, and command APIs. It
checks pin order, adjacent solid strikes, legal detail-mode alternation, and
registration across two bands. Generating the stream is offline; submitting it
to the configured printer is a separate, explicit step.
