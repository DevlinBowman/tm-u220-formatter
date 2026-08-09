# U220 Job Format v1

The U220 job language is a line-oriented interpreted text format. The CLI uses
it by default for any file or quoted argument. The versioned strict header is
accepted but not required by the CLI:

```text
!tm-u220 job 1
```

The `.u220` extension is a useful convention, not a mode switch. Canonical
directives are interpreted in `.txt`, `.u220`, and positional inline arguments.
`--text TEXT` compiles a literal string and `--ftext FTEXT` compiles a formatted
string through the same interpreter used for file contents. The options are
mutually exclusive, cannot accompany a positional input, and never resolve their
values as paths. External content generation must produce finished input first.

When the header is present, only column-one `#` comment lines may precede it. A
blank line, an indented comment, or other content before it is an error. After
the header, column-one `#` lines are comments. In headerless interpreted input,
ordinary `#` heading lines remain printable. Every ordinary line prints as one
logical line, and a blank line prints an empty line.

Line directives may be indented with spaces or tabs. Their name and argument
may be separated by horizontal whitespace, and padding around validated scalar,
profile, cut, rule, and key/value syntax is ignored. Extra non-whitespace input
is still an error. `@text` is the exception: after its first separating space or
tab, the remaining whitespace is literal receipt content.

A literal line beginning with `@` is escaped by doubling its first character:

```text
@@not-a-directive
```

That prints `@not-a-directive` followed by a line feed. Double a leading `#` as
well: `##literal-comment` prints `#literal-comment`.

## Minimal job

```text
# receipt template
!tm-u220 job 1
@profile variant=b paper=76 dip2_1=off cutter=partial
@align center
@emphasis on
acme coffee
@emphasis off
@align left
@kv subtotal | $12.00
@rule -
@fi
```

Compilation automatically places `ESC @` at the beginning of every job. Do not
add an initial `@init` merely to initialize the printer. An explicit `@init`
inserts another reset where it appears and is useful only when a deliberate
mid-job reset is required.

## Printer profile

Formatting requires an explicit physical profile. A job can carry one profile
directive:

```text
@profile variant=A|B|D paper=76|69.5|57.5 dip2_1=on|off cutter=partial|full|none
```

All four fields are required and must be unique. Field order is not
significant. Spaces around `=` are accepted in an authored `@profile` directive,
but the values must describe real hardware:

- Type A supports 76 mm paper and an installed partial or full cutter.
- Type B supports 76, 69.5, or 57.5 mm paper and a partial or full cutter.
- Type D supports those three paper widths and requires `cutter=none`.

For a reusable printer configuration, pass `--profile printer.u220p`. The saved
profile format is also strict and versioned:

```text
!tm-u220 profile 1
variant=B
paper=76
dip2_1=off
cutter=partial
```

Saved profile fields use exact `key=value` syntax without spaces. Blank lines
and comments are allowed. Every field is required and cross-field hardware
rules are validated. If a job contains `@profile` and `--profile` is also
supplied, they must match exactly or compilation fails with a profile-conflict
diagnostic.

## Directives

```text
@profile variant=A|B|D paper=76|69.5|57.5 dip2_1=on|off cutter=partial|full|none
@init
@align left|center|right
@font a|b
@emphasis on|off
@double-strike on|off
@double-width on|off
@double-height on|off
@underline off|single|double
@color black|red
@upside-down on|off
@spacing 0..255
@line-spacing default|0..255
@code-page 0|2|3|4|5|16|17|18|19
@text TEXT
@line
@tab
@feed 0..255
@feed-units 0..255
@reverse-lines 0..255
@reverse-units 0..255
@image PATH [WIDTH HEIGHT]
@rule PATTERN
@kv LEFT | RIGHT
@table [L|R,]WIDTH[CONTENT][GROUP][,...]
@head FIELD | FIELD [...]
@row FIELD | FIELD [...]
@end-table
@fi
@cut installed|full|partial [feed=0..255]
```

That list is the canonical syntax. A configured authoring vocabulary provides
concise fixed and argument-forwarding aliases:

| Canonical directive or sequence | Concise aliases |
| --- | --- |
| `@cut installed` | `@cut` |
| `@feed N` | `@lf N` |
| `@emphasis on` | `@bold`, `@bold on` |
| `@emphasis off` | `@bold off`, `@bold-off` |
| `@align left` | `@left` |
| `@align center` | `@center` |
| `@align right` | `@right` |
| `@color red` | `@red` |
| `@color black` | `@black` |
| `@font a` | `@font-a` |
| `@font b` | `@font-b` |
| `@double-width off \| @double-height off` | `@normal-size` |
| `@double-width on \| @double-height off` | `@wide` |
| `@double-width off \| @double-height on` | `@tall` |
| `@double-width on \| @double-height on` | `@large` |
| `@underline single` | `@underline`, `@ul` |
| `@underline double` | `@underline-double`, `@ul-double` |
| `@underline off` | `@underline-off`, `@ul-off` |

Every alias resolves to canonical directive input before validation and
compilation. They may be used anywhere that their canonical targets are valid,
including a source-line directive sequence. Size aliases are absolute presets:
each sets both width and height, so prior size state cannot leak into the result.
The canonical forms remain available when explicit values are clearer;
argument-bearing `@cut installed|full|partial` and
`@underline off|single|double` retain their canonical meanings.

### Alias configuration

The checked-in [alias configuration](../config/directives/aliases.u220a) is the
authoritative convenience mapping. It is a versioned, line-oriented file:

```text
!tm-u220 aliases 1

@cut == @cut installed
@lf * == @feed *
@bold == @emphasis on
@bold * == @emphasis *
@left == @align left
```

The left side is an authored alias. A bare mapping matches only the bare alias;
`*` matches and forwards the complete argument text. Both variants may coexist,
as with `@bold` and `@bold off`. The right side is one or more complete canonical
directives separated by ` | `. Targets are never resolved as aliases again, so
cycles are impossible and all behavior remains owned by the canonical parser.

Add a local vocabulary directly to the same file. For example:

```text
@big-red == @emphasis on | @double-height on | @color red
```

The next compilation reloads the file. Duplicate mappings, malformed
placeholders, an invalid header, or an unreadable configuration stop compilation
with a diagnostic instead of silently changing the document.

`@underline single` and `@underline double` retain the two supported ESC/POS
parameter values. On the TM-U220 both print the same one-dot-thick underline,
so the physical preview intentionally renders one strike row for either value.

Numeric arguments are decimal integers from 0 through 255. Unknown directives,
unknown fields, extra arguments, invalid enum values, duplicate profiles, and
out-of-range numbers are errors. `@code-page` is narrower: its integer must name
one of the public standard pages shown in the directive list.

For example, `  @align   center  ` and `@cut partial feed = 2` are equivalent
to their compact forms. `@kv LEFT|RIGHT` and `@kv LEFT | RIGHT` are also
equivalent; padding immediately around the field separator is not printed.

`@spacing` is measured in 1/160-inch half-dot positions. `@line-spacing`,
`@feed-units`, `@reverse-units`, and the optional cut `feed=N` use 1/144-inch
vertical units. `@feed` and `@reverse-lines` use logical line counts.

Style directives are persistent printer state: their value remains active until
another directive changes it or `@init` resets the state. Authors must restore a
temporary style explicitly with its corresponding native directive.

A source-line directive sequence keeps several directives on one source line.
Every directive remains complete. A pipe followed by optional spaces or tabs
and another `@directive` is a separator; ` | @` is the canonical style:

```text
@font a | @emphasis on | @double-width on | @underline double | @color red
@text 0 | @tab | @text 8 | @tab | @text 16 | @line
```

An ordinary pipe remains text in `@text A | B`, and `@rule |` still prints a
pipe divider. Inside `@text`, a pipe followed by optional horizontal whitespace
and an `@directive` begins the next directive. Escape that pipe as `\|` to emit
the reserved text literally:
`@text A \| @font b` emits `A | @font b`. `@image`, `@kv`, `@table`, `@head`,
`@row`, and `@end-table` each own their complete source line and cannot be
sequence members.
The pipes in `@kv`, `@head`, and `@row` remain field separators. A sequence runs
from left to right exactly like its directives on separate source lines. An
invalid member rejects the whole source line. Every normal placement, ordering,
and hardware restriction still applies. Individual directive lines remain
available.

`@text` emits its text argument without a line feed. Its `\|` escape becomes a
literal pipe; other backslashes remain text. This makes it possible
to build one printer line across several operations. `@line` emits a line feed,
while every ordinary source line combines text and a line feed. `@tab` advances
to the next default horizontal tab stop; when no stop remains, compilation
retains the command and reports a warning.

The following operations are accepted only at the beginning of a printer line:

- `@init`
- `@align`
- `@color`
- `@upside-down`
- `@image`
- `@rule`
- `@kv`
- `@table`
- `@head`
- `@row`
- `@end-table`
- `@fi`
- `@cut`

The compiler reports invalid placement rather than moving a command. A cut also
requires an autocutter and must agree with the saved installed cut shape.
`@cut installed` selects that saved shape. ESC/POS cannot physically convert a
partial cutter into a full cutter or vice versa.

`@upside-down on` prints subsequent lines with characters rotated 180 degrees
and ordered from right to left, matching the TM-U220's ESC `{` behavior.
`@upside-down off` restores normal orientation. Both changes must occur at the
beginning of a printer line, and `@init` restores the default off state. The
orientation changes characters within a line; it does not reverse line order.

Every valid `@cut` uses Epson GS V Function B. That function first advances the
paper from the print head to the physical cutter position, then applies the
installed cut shape. The optional `feed=N` adds `N` 1/144-inch vertical units
after reaching the cutter position; its default is zero.

`@fi` is terminal shorthand for `@feed 4` followed by `@cut installed`. It takes
no arguments, may appear only once, and must be the final job operation. Use
plain `@cut` when the fixed four-line finish margin is not wanted. Preview
reports the four lines, advance to cutter position, and installed cut shape.

## Printhead images

`@image` places a PBM or PNG companion file without converting it to text:

```text
@image art/logo.pbm
@image "art/chicken portrait.png" 20 10
@image art/banner.png page auto
```

Paths are relative to the file-backed job. Absolute paths, traversal, links,
and URLs are rejected. In an explicit inline CLI job, paths are relative to the
directory where `220` was invoked; standard input has no image base. A path
without whitespace may be unquoted. Double-quoted paths escape only `\"` and
`\\`. The optional box must provide both values: width is `page` or 1..255
current character cells; height is `auto` or 1..255 current character cells.
Current font, spacing, double-width, and double-height state determine those
cell measurements. Alignment positions the complete image box and color selects
the black or red ribbon.

The active versioned image profile controls omitted dimensions, contain/cover/
stretch fitting, nearest/area/bilinear resampling, threshold/ordered/Floyd
dithering, inversion, solid/detail density, unidirectional band registration,
and the trailing paper gap. Its checked-in default is
[`config/images/default.u220i`](../config/images/default.u220i). Solid mode is
80 x 72 dpi. Detail mode is 160 x 72 dpi and the interpreter prevents adjacent
horizontal strikes required by the TM-U220 hardware.

Strict binary PBM (`P4`) and non-interlaced 8-bit PNG are accepted. JPEG is not
yet supported. A PBM or PNG path may also be passed directly to `check`,
`render`, `compile`, `preview`, or `print`; it becomes a one-image job using
profile defaults. Direct image preview is read-only and paints the exact final
printer-dot mask.

## Text and wrapping

Both interpreted and plain CLI input preserve valid Unicode after removing an
optional UTF-8 BOM. At compile time, each Unicode glyph is resolved through the
standard-model resident page catalog. The formatter emits Epson `ESC t n`
before an extended-byte run and emits `ESC t 0` before subsequent unlocked ASCII
or a print boundary. A glyph absent from the automatic catalog becomes a visible
`?` and produces a `FORMAT_GLYPH_SUBSTITUTED` warning. Use `@tab` and line
operations for control behavior.

`@code-page N` explicitly locks following text to page `N` for the rest of the
current printer line. This matters when the selected page assigns a different
byte to a glyph also available elsewhere; for example, page 2 prints `¢` from
byte `BD` instead of page 0 byte `9B`. An explicit or wrapping line feed, feed
or reverse-feed motion, cut, or `@init` releases the lock. The printer returns
to page 0 before an ordinary print boundary, and later unlocked text resumes
automatic Unicode page selection. A page value outside the public standard-page
catalog is rejected.

Wrapping is deterministic hard wrapping:

1. The formatter computes character advance from the current font width and
   spacing, doubling it when double-width mode is active.
2. It computes how many complete characters fit in the selected paper's
   remaining half-dot width.
3. It emits exactly that glyph-cell prefix and inserts a line feed when more text
   remains.
4. It continues without looking for spaces, hyphenating, trimming, or changing
   any printable byte.

UTF-8 byte length never determines layout: every mapped Unicode scalar consumes
one formatter cell even when its source encoding uses multiple bytes. A style
or spacing change can change capacity for subsequent text, including text later
on the same printer line. If a job ends with buffered `@text`, the compiler adds
one final line feed; it does not add another line when already at the beginning
of one.

`@rule PATTERN` requires one or more printable Unicode glyphs after surrounding
horizontal padding is ignored. It repeats the pattern, clipping the final
repetition by whole glyphs to fill exactly the current line capacity, and then
feeds one line. For example, `@rule -` prints a hyphen divider and `@rule -+`
prints an alternating divider. The normal ` | @directive` sequence marker
remains reserved. `@kv LEFT | RIGHT` requires the right value to fit one line.
It hard-slices an oversized left value into full lines, then space-pads the final
line so the right value reaches the current capacity. Neither operation performs
word wrapping.

## Tabulated formatting

A table block separates three kinds of alignment: the whole table, each column's
group within that table, and each value within its cell:

```text
@table 9,4,4LR,3LR,8RR
@bold
@head Board | Spcs | Pcs | Grd | Ea
@bold-off
@row 2x4x16 | RW | | | $29.99
@end-table
```

The optional first bare `L` or `R` aligns the table's unsplit column group on the
printable line. It also supplies the default group for columns that do not name
one. Omitting it means `L`, so these are equivalent left-aligned tables:

```text
@table 9,4,4
@table L,9,4,4
```

`@table R,9,4,4` instead packs the complete group against the right edge. Table
alignment is only `L` or `R`; centered content is controlled per cell.

Every other token declares an actual column as a positive width followed by up
to two optional alignment letters:

- The first suffix (`L`, `C`, or `R`) aligns content inside the cell and defaults
  to `L`.
- The second suffix (`L` or `R`) assigns the column to the table's left or right
  group and defaults to the table alignment.

A number alone therefore uses both defaults. `4R` means right-aligned content in
the default group, while `4LR` means left-aligned content explicitly placed in
the right group. Left-group columns pack from the printable line's left edge;
right-group columns pack from its right edge. Left-group columns must be declared
before right-group columns. Adjacent columns within a group have one implicit
space cell between them. When both groups exist, all remaining line width becomes
flexible space between them and must contain at least one cell. No final column
is inferred.

`@head` and `@row` must each provide exactly one field per declared column.
Adjacent separators represent an intentional empty field. Padding around
separators is structural and ignored; `\|` writes a literal pipe within a field.
Headers receive no automatic styling, so the example applies the existing bold
alias explicitly.

The table freezes the current printable width, character advance, whole-line
justification, and orientation. `@init`, `@font`, `@spacing`, `@double-width`,
`@align`, and `@upside-down` are therefore errors until `@end-table`. Every
header and row is measured completely before output, positioned across the
current line capacity, and followed by one line feed. Oversized fields,
impossible column widths, insufficient space between column groups, invalid
group ordering, missing or extra fields, nested tables, rows outside a table,
and an unclosed table are errors. Table cells never wrap or truncate implicitly.

The preview uses these exact layout decisions and records style segments and
line-break reasons. Baseline preserves the earlier calibrated browser glyphs.
The default 9-pin view adds a deterministic physical strike model. Its authored
atlases cover ASCII and may contain sparse project-authored page-0 PC437 masks.
An extended exact mask requires matching compiler-owned page-0 and resident-byte
metadata. Unauthored page-0 slots and mapped glyphs from other code pages use a
browser-backed dotted representative. Missing or malformed proof fails closed
to `?` because the application does not contain Epson's resident-ROM bitmaps.
This visual limitation does not change the compiled code-page bytes.

## Failure behavior

Parsing and formatting collect stable line diagnostics. Any error—including an
invalid profile, malformed directive, malformed UTF-8, embedded text control,
impossible layout, or invalid line-boundary command—prevents the CLI from
writing a printer byte stream. Warnings, including an unavailable glyph replaced
with `?` or an ignored horizontal tab with no remaining stop, do not by
themselves prevent encoding.
