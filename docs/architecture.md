# Architecture

This project is a trustworthy TM-U220 formatter, ESC/POS compiler,
stream parser, terminal renderer, and browser preview tool. It is a clean
implementation: it does not
import or execute code from `U220_print`, `U220_printV2`, or `U220_v3`.

It intentionally is not a hardware emulator. It does
not execute ESC/POS nodes against a virtual mechanism or simulate timing,
status, transport, paper sensors, ribbon behavior, cutter motion, or dot-level
glyph output.

## Canonical flows

```text
ready file -----------------------> UTF-8 prepare --default interpreted parse--+
standard input -------------------> UTF-8 prepare --default interpreted parse--+
quoted text ----------------------> UTF-8 prepare --interpreted------------+--> JobDocument
--text TEXT ----------------------> UTF-8 prepare --plain AST---------------+    + selected profile
--ftext FTEXT --------------------> UTF-8 prepare --interpreted-------------+
                                                                     |
                                                                     +--> format/layout
                                                                               |
                                      physical paper preview plan <------------+--> ESC/POS nodes
                                                 |                                    |
                                                 +--> live HTML/CSS render            +--> encode --> bytes

browser editor buffer --> in-memory preparation --> same JobDocument path above

installed manifest + profile --> local route/profile orchestration
verified bytes --default installed LPD session--> staged acknowledged submission
               --explicit installed --live-----> gated bidirectional RAW session
               --advanced one-shot RAW TCP-----> exact socket submission

raw or hex bytes --strict ESC/POS parse--> command/text nodes + diagnostics
query response   --discovery decode-----> one documented printer fact

allowlisted source checkout --> two-pass local snapshot --> versioned user release
                              --> atomic current link --> installed 220

bundled authoring config --checkout--> repository working copies --+
                          --installed--> seeded XDG/HOME copies ------+--> Vim tabs
```

There is one job compilation path. Terminal rendering, browser preview, and byte
compilation consume the same parsed document, profile, formatter state, and
layout rules. The browser presents the canonical paper plan; it is not a second
receipt-layout implementation with separate behavior.
Content generation and templating are upstream responsibilities; this project
receives only finished text or native U220 source.

## Domain ownership

- `job` owns the versioned authoring grammar, strict native directives, and the
  data-only alias catalog that expands convenience input into canonical input.
- `profile` owns strict saved profile files and decoding of supported
  bidirectional settings-query responses.
- `config` owns the fixed authoring-file catalog and selects repository or
  per-user aliases and profile paths according to release mode.
- `spec` owns immutable TM-U220 model facts, effective profiles, and supported
  command definitions.
- `format` owns text state, hard wrapping, tabs, rules, key/value and tabular
  layout, preview-line construction, and the physical paper-motion plan.
- `escpos` owns atomic byte encoding and strict byte-stream parsing.
- `render` presents previews, parsed streams, and decoded profile facts. It does
  not simulate a printer mechanism.
- `live` owns transport-neutral checkpoint planning and proves that compiler
  payload bytes are neither lost, duplicated, nor reordered.
- `transport` owns delivery and never owns formatting. Its `live_raw` modules
  own the fixed privileged route and bidirectional session boundary; `lpd`
  separately owns envelope and five-stage protocol submission; `raw_tcp` is an
  optional one-shot transport.
- `printing_policy` owns the cross-runtime manifest schema, installed paths,
  fixed route shapes, profile binding, generated sudoers bytes, and package
  review data. It contains no machine address or account choice.
- `printing_setup` owns the macOS-only environment/preflight audit, guided
  selection, unprivileged reviewer, script-free four-artifact package,
  post-install verification, and explicit authorized device check. It never owns
  job delivery and never attempts an ordinary pre-authorization connection.
- `printing_removal` owns read-only deauthorization planning, exact legacy or
  canonical state admission, fixed administrator command vectors, and
  post-removal verification. It does not remove the user application.
- `install` owns the separate unprivileged application lifecycle: an explicit
  source allowlist, local source snapshot, versioned releases, integrity
  inspection, activation locking, and acknowledged application removal. It
  never changes machine printing policy and makes no publisher-signature claim.
- `app` is the orchestration boundary between those domains. It owns
  interpreted/plain resolution, live-buffer preparation, local defaults,
  compilation, and print flow.
- `cli` parses commands and delegates to `app`.
- `web` owns the loopback editor session and HTML/CSS presentation. It invokes
  the application compilation boundary, saves only to the originally opened
  file, and has no dependency on either transport.

Feature domains do not import legacy implementations. Cross-domain behavior is
wired in `app`, rather than embedding formatter policy in the byte codec or
device facts in the job parser.

## Authoring configuration boundary

CLI orchestration resolves the active directive-alias catalog and authoring
profile, then passes those explicit paths into compilation and preview services.
The parser, formatter, web workspace, and transports do not discover user home
directories or choose configuration ownership modes themselves.

In a checkout, the fixed catalog resolves directly to the two repository
working files. In a managed release, bundled files remain factory templates and
the private configuration helper lazily seeds user-owned copies under the
configured XDG/HOME root before opening both in fixed Vim tabs. Seeding refuses
unsafe directory, ownership, link, mode, and size state; it never overwrites an
existing file. The user copies are intentionally mutable and outside the
content-addressed release.

This authoring boundary has no path to the root-owned printing manifest,
physical profile, or privileged connection rules. Local LPD and live routes
replace the authoring profile with the separately verified installed policy;
`220 config` cannot weaken or update that policy.

## Graphical editor boundary

`220 preview FILE` starts a Node standard-library server bound only to
`127.0.0.1`, then opens the editor in a browser. The editor sends the current
buffer through the Lua compilation bridge, so unsaved content follows the
same interpreted or plain preparation and formatting path as a file. Preview
responses contain canonical segment positions, advances, line spacing, paper
motion, and cutter events; JavaScript only maps that plan into paper geometry
and dispatches it to one of two visual renderers.

The browser surface models document layout and printer style state, including
paper width, alignment, color, emphasis, double strike, double dimensions,
underline, upside-down text, feed motion, and cuts. The default 9-pin renderer
turns complete, independently authored Font A and Font B ASCII atlases into
explicit strike plans, then adds overprint passes and deterministic ribbon
bleed. A per-character browser-backed dotted layer represents only non-ASCII
glyphs carrying compiler-owned resident page and byte metadata; missing or
malformed proof fails closed to the modeled `?`. Exact ASCII strikes and the
resident bytes in the compiled job remain unchanged. The Baseline renderer
keeps the historical profile-calibrated browser glyphs. Both renderers consume
the same compiler geometry. Strike geometry is hardware-derived, but the
manually observed ASCII and browser-backed non-ASCII shapes remain representative;
the formatter does not contain Epson's resident-ROM bitmaps.

Horizontal character advance is the resident 7- or 9-position matrix, plus the
profile's built-in DIP-switch character spacing, plus any added `ESC SP`
spacing. Each matrix column is a 1/160-inch horizontal half-dot position
containing either no
strike or one full pin impact; adjacent resident positions may therefore
overlap. Rows use the 1/72-inch vertical pin pitch. Wide and tall modes expand
each fixed-radius impact to 2×1 or 1×2 positions; enabling both yields a literal
2×2 block. This preserves wrapping, justification, tabs, and the visible
character spacing when no additional spacing is requested.

The checkout-only glyph workspace keeps all 7×9 or 9×9 positions editable. Its
Font A/B authoring baseline after pin 7 is an explicit reconstruction guide,
not resident printer data; Epson defines no internal baseline, and the printer's
matrix-bottom line-alignment edge remains after pin 9. The workspace presents
built-in character spacing and default line spacing outside the matrix, and
none of these guides enter a saved glyph mask.

The normal 9-pin character cell is 18 vertical units. A marked double-height
line adds one cell to its configured line spacing, matching physical TM-U220
capability-sheet measurements; blank lines use only configured spacing. Runs of
different heights share the printer baseline. Editor and receipt scroll
positions are linked by normalized source spans and paper events, and stale
error previews deliberately do not drive scrolling.

Command-S is an explicit, atomic write to the fixed file selected when the
session started, or to a browser file with an active writable handle.
Shift-Command-S owns separate copy creation; a read-only browser file never
falls through to the session target. The web domain does not expose arbitrary
server-side paths. Preview compilation may produce bytes in memory, but editing
never submits or transports them to a printer.

## Initialization and profiles

Every successful job compilation starts its node stream with
`control.initialize`, which encodes as `ESC @` (`1B 40`). Authors do not need an
initial `@init`. An authored `@init` means an additional reset at that point and
is valid only at the beginning of a printer line.

The compiler requires one explicit, fully resolved printer profile. Non-printing
CLI work uses the active authoring profile: the repository example at
`config/printers/local.u220p` in a checkout, or a seeded user copy when present
in a managed release. Until that copy is seeded, the bundled factory profile
remains the authoring default. Friendly local printing instead loads the
root-owned profile whose exact length and SHA-256 are bound by the installed
manifest. `--profile` may select another strict saved `.u220p` file for
non-printing or advanced one-shot work; a local print accepts it only when its
bytes match the installed physical profile. A job may declare the same facts
with `@profile`. If authored and selected profiles are both present, they must
describe the same variant, paper width, DIP 2-1 setting, and installed cutter
shape; a mismatch is an error.

Supported query-response decoding can confirm some electronic settings, but it
cannot discover every physical choice. Paper width, DIP 2-1, Type A versus
Type B, and the installed full/partial cutter shape remain explicit facts.
Query helpers list request bytes and decode supplied responses; they do not
open a printer connection or perform I/O with hardware.

## Formatting model

Interpreted and plain input preserve valid UTF-8 after removing an optional
leading BOM. The formatter resolves supported Unicode scalars through the
standard-model character-page catalog, emits `ESC t n` before a changed page, and
returns to page 0 before unlocked ASCII or a print boundary. Text nodes keep the
encoded printer bytes separate from their Unicode preview text. A scalar absent
from the active catalog becomes `?` with a `FORMAT_GLYPH_SUBSTITUTED` warning;
malformed UTF-8 and embedded C0 or DEL text controls are errors. Newlines and
tabs remain structural operations rather than text bytes. The public catalog is
generated from Unicode-licensed standard mappings. An explicit one-line
`@code-page` lock can select only a page in that catalog; all other values are
rejected.

Horizontal layout uses the selected paper's printable width in half-dot
positions. Character advance is the current font matrix width plus character
spacing, doubled when double-width mode is active. Text is hard-wrapped at the
largest complete scalar-cell prefix that fits the remaining width; UTF-8 byte
length does not determine layout. Wrapping does not search for words, add
hyphens, trim spaces, or otherwise rewrite payload text.

An ordinary source line supplies an implicit line feed. `@text` does not.
Unterminated buffered text receives one final line feed at the end of a job.
`@rule` trims authoring-edge padding, repeats its remaining non-empty scalar-cell
pattern, and clips the final repetition to fill exactly the current line
capacity. `@kv` hard-slices an oversized left value, requires the right value to
fit one line, and pads the final line so the right value reaches the current
capacity. Preview line breaks and compiler line feeds are produced by these same
decisions.

Tabular formatting is a scoped formatter feature rather than printer state.
`@table` freezes the current horizontal signature and uses its complete cell
capacity. An optional table alignment selects the default left- or right-packed
column group; omission means left. Each explicit column independently declares
its width, optional content alignment, and optional override of that default
group. The tabular schema adds one implicit space between adjacent columns in a
group and uses remaining capacity as slack opposite or between groups. `@head`
and `@row` validate every scalar-cell value before constructing a positioned
text line. The schema lives in the compiler's tabular session, not in the
ESC/POS state model, and `@end-table` discards it. No table operation adds a
printer command; compiled rows remain ordinary text and a line feed.

Justification, color selection, upside-down orientation, initialization, rules,
key/value layout, and cutting require the beginning of a printer line. The
compiler diagnoses an invalid placement instead of moving the command or
silently changing its meaning. Preview marks upside-down segments while keeping
the transmitted text and line order unchanged.

Every cut uses Epson GS V Function B, which advances from the print head to the
physical cutter position before cutting. Terminal `@fi` expands to four logical
feed lines followed by an installed-shape cut. Preview reports the finish action
using the same compiled job metadata.

## Trust rules

1. Default input interprets canonical directives regardless of file
   extension. A versioned header is accepted but optional at the CLI boundary.
   `--text TEXT` selects a separate plain AST; `--ftext FTEXT` selects the same
   interpreted AST as file content. Both options are string-only and mutually
   exclusive with each other and positional input.
2. Job headers, directives, arguments, alias configuration, and saved profiles
   are strictly validated. Alias targets enter the canonical parser directly
   and are never recursively expanded. Malformed UTF-8, C0 or DEL text controls,
   impossible layout, and profile conflicts prevent a printer byte stream. A
   valid Unicode scalar missing from the active resident pages prints as `?`
   with an explicit warning.
3. Compilation emits `ESC @` first and encoding is atomic: an invalid node does
   not produce a partial encoded result.
4. Unknown or truncated control sequences in inspected byte streams remain
   diagnostic nodes; they are never reclassified as printable text.
5. Physical values use explicit integer units. Horizontal positions are
   1/160-inch half-dot positions; vertical motion uses 1/144-inch units.
6. Output ordering is deterministic, including sorted JSON object keys.
7. Each implemented command is expected to have exact encoding and parsing
   fixtures before it is admitted to the command registry.
8. Default printing uses the LPD route from the strict installed manifest and
    submits the compiled payload as one whole job. `--live` explicitly selects
    the same manifest's bidirectional RAW endpoint and checks online, cover,
    error, and paper state before releasing compiler-owned payload bytes.
9. The live planner partitions only at compiler-recorded line, motion, and cut
    boundaries, proves that the step payloads exactly reassemble the compiled
    bytes, and keeps at most one checkpoint in flight. A failure never retries
    the ambiguous operation or falls back to a whole-job transport. Transport
    framing disables automatic status before preflight and structurally after
    every `ESC @`; complete unsolicited status frames can never donate an inner
    byte to a requested checkpoint response.
10. The default LPD policy takes its validated private IPv4 address from the
    installed manifest; product policy fixes destination port 515, queue `lp`,
    reserved source ports 731 through 721, a five-second timeout, and a one MiB
    payload ceiling. Ordinary CLI input cannot redirect it.
11. LPD preserves the compiled data payload and advances only after each of five
    zero acknowledgements. It may rotate a quarantined source port before the
    first acknowledgement, when no job files have been sent; it never retries
    after the server accepts that receive-job stage.
12. Operating-system authorization for privileged source ports is restricted to
    19 exact local connections derived from one manifest. The session controller
    remains unprivileged and the ordinary CLI does not acquire general elevated
    access. Setup records why device contact must be deferred, requires exact
    review, and hands a script-free four-file package to Apple Installer. Only
    after installation may an explicit check send allowlisted Epson
    identity/status queries through the reviewed bypass.
13. One-shot RAW TCP submission also preserves compiled bytes and retries only a
    confirmed pre-connection local bind collision.
14. A live checkpoint, LPD acknowledgement, or completed RAW TCP write is not
    evidence that ribbon ink reached the paper.

## Product boundary

The formatter covers receipt-critical text, styles, paper motion, rules,
key/value layout, cutting validation, terminal rendering, graphical preview,
and strict stream inspection. The default product path uses whole-job LPD delivery to the
configured local printer; gated bidirectional `--live` delivery and one-shot RAW
are explicit alternatives. Preview
records exact formatter layout decisions, style segments, physical coordinates,
and paper-motion events, apart from explicitly documented mechanical estimates
such as head-to-cutter travel. Its HTML/CSS surface makes those decisions visible
but does not simulate the printer mechanism, timing, sensors, ribbon transfer,
or dot-level ROM glyph output.
