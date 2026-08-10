# Printhead image pipeline

The printhead feature converts local artwork into physical TM-U220 strikes
without treating pixels as text glyphs. Image interpretation, raster fitting,
dithering, and hardware band packing remain separate from receipt text and
printer transport.

## Domain boundary

```text
local PBM/PNG/JPEG --image profile--> grayscale/one-bit raster --> safe dot mask
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

Supported image files are strict binary PBM (`P4`), non-interlaced 8-bit PNG,
and bounded 8-bit JPEG. PNG grayscale, RGB, indexed-color, grayscale-alpha, and
RGBA inputs are reduced to luminance with transparency composited on white.
JPEG baseline, extended sequential, and progressive frames may use one, three,
or four components. Four-component input requires canonical Adobe APP14
metadata identifying CMYK (transform 0) or YCCK (transform 2) samples. JPEG
pixels are decoded in stored order; EXIF orientation and ICC color profiles are
not applied.

Each source image is limited to 1 MiB and either dimension to 4096 pixels. A
job may contain at most 16 images, 4 MiB of source image data, and 4,194,304
decoded source pixels in total. These limits apply before resizing for paper.

A supported image can also be the complete command input:

```sh
220 preview art/chicken.png
220 render art/chicken.png
220 compile art/chicken.png --hex
220 print art/chicken.png
```

For a direct image in your home directory, leave the tilde unquoted or quote
`$HOME` instead: `220 print ~/Downloads/chicken.jpg` or
`220 print "$HOME/Downloads/chicken.jpg"`. A single-quoted `~/...` is a literal
path under normal shell rules.

Direct images use the profile's default full-page/automatic box. `220 preview`
opens an image as a read-only session and paints the exact final printer-dot
mask; image bytes never enter the source editor or its save path. Put `@image`
in a receipt when the image should be previewed alongside text.

## Live profile editor

Open a direct PNG, JPEG, or binary PBM image for interpretation tuning:

```sh
220 image-profile art/chicken.png
```

The selected image is resolved when the command starts, then remains fixed and
read-only. Every draft profile is parsed and compiled through the canonical
direct-image pipeline, so the live paper view paints the exact final printer-dot
mask rather than an approximate browser conversion. Revert restores the saved
settings. Save or Command-S updates the active image profile.

This workspace exposes preview geometry and diagnostics only. It has no print
action, emits no printer bytes to the browser, and does not contact the printer.
Stop its loopback server with Ctrl-C when tuning is finished.

## Interpretation profile

Image interpretation uses a separate versioned data profile rather than adding
artistic choices to the physical printer profile. The shipped file is
`config/images/default.u220i`; `220 config` opens its active editable copy as
the third of three Vim tabs.

```text
!tm-u220 image-profile 1
density=solid
fit=contain
resample=bilinear
dither=floyd
threshold=128
invert=off
unidirectional=on
trailing_gap_vertical_units=4
default_width_cells=page
default_height_cells=auto
```

| Field | Interpretation |
| --- | --- |
| `density` | `solid` uses 80 × 72 dpi and permits adjacent impacts; `detail` uses 160 × 72 dpi but forbids horizontally adjacent impacts. |
| `fit` | `contain` and `cover` preserve physical aspect ratio; `stretch` fills the requested box. |
| `resample` | `nearest` preserves hard source pixels, `area` averages reductions, and `bilinear` interpolates neighboring samples. |
| `dither` | Selects `threshold`, `ordered`, or `floyd` conversion from luminance to physical strikes. |
| `threshold` | Sets the black/white decision level from 0 through 255; a higher value produces more strikes. |
| `invert` | Reverses source luminance before dithering. |
| `unidirectional` | Enables unidirectional bit-image bands for registration. |
| `trailing_gap_vertical_units` | Adds the deliberate paper gap after the final image band. |
| `default_width_cells` | Supplies `page` or a positive default width when `@image` omits its box. |
| `default_height_cells` | Supplies `auto` or a positive default height when `@image` omits its box. |

PNG transparency is composited on white before interpretation. JPEG uses the
same integer luminance conversion after deterministic bounded decoding.

### Dithering and physical detail

The print head remains one-bit hardware: every final position is either struck
or left blank. Dithering creates the perception of tone by changing the spatial
density of those impacts; it does not create gray ink.

- `threshold` makes one direct luminance decision at each target position. It
  gives hard silhouettes and loses intermediate tone most readily.
- `ordered` offsets that decision over a repeating 4 × 4 Bayer pattern. Gray
  regions become stable, regular impact patterns.
- `floyd` propagates quantization error into nearby positions. Its less regular
  impact pattern usually retains more photographic shading.

For photographs, `resample=bilinear` with `dither=floyd` is the recommended
starting point. The live editor makes the resulting physical mask visible before
saving it.

Solid density is the safe 80 × 72 dpi default and can produce uninterrupted
dark regions. Detail density provides twice as many horizontal positions at
160 × 72 dpi, but the TM-U220 mode cannot safely strike horizontally adjacent
positions. The preparation stage removes such adjacency and the band packer
validates it again, so detail mode can look lighter and is not automatically
better for photographs.

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
