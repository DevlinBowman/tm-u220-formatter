# CLI contract

The `220` command is a small public interface over independent formatter,
profile, and printing domains. Its grammar is declared once, its command paths
are normalized before dispatch, and application services do not parse command
line tokens themselves.

## Public shape

- A bare `220`, `220 help`, `220 --help`, and `220 -h` show the concise overview
  and do not mutate state.
- `220 help COMMAND`, `220 COMMAND --help`, and `220 COMMAND -h` show the same
  focused help. Grouped paths such as `220 help printer status` are supported.
- `220 version` and root `220 --version` read the release's canonical `VERSION`
  file.
- Flat command names remain accepted for existing public commands. The `printer`
  and `profile` groups provide a more navigable spelling for related commands.
- `220 dev glyphs` opens the checkout-only glyph editor and receipt preview. It
  has no flat spelling and refuses to run from a managed installation; the
  direct `./dev/glyphs` launcher retains advanced receipt and server options.
- `220 preview FILE` owns the live browser workspace. `220 render [INPUT]` owns
  terminal, JSON, and file rendering; the former `edit` command is removed and
  has no alias.
- `220 image-profile IMAGE` opens one PNG, JPEG, or binary PBM as a fixed,
  read-only source for live image-interpretation tuning. It accepts no alternate
  filesystem target or printing option.
- `220 directives` is the read-only compact directive and shipped-alias list;
  `220 rules directives` remains the detailed behavioral reference.
- `220 config` opens the fixed directive-alias, authoring printer-profile, and
  image-profile files in three Vim tabs. It accepts no path arguments.
- `--` ends option parsing. It may also force an option-looking value after a
  value-taking option. `-o -` explicitly selects standard output.

The command catalogs in `src/tm_u220/cli/commands.lua` and
`src/tm_u220/cli/developer_catalog.lua` own command paths, arity, accepted option
families, usage signatures, summaries, aliases, and focused-help notes.
`src/tm_u220/cli/options.lua` owns option spellings and descriptions.
Normalization modules own their individual policies; the dispatcher only calls
the selected application service.

## Input and terminal safety

Positional input may resolve to a file or interpreted text. A missing value that
looks like a path is an error, including a filename with spaces; `--text` and
`--formatted-text` are the explicit escape hatches for literal and interpreted
strings. Only commands whose descriptors opt in may infer standard input.

The shell launcher records whether standard input and output are terminals.
Implicit standard input is rejected on a terminal, so an omitted argument cannot
silently wait for keyboard EOF. An explicit `-` still means the user chose
standard input. Binary `compile` output is rejected on a terminal unless `--hex`
or a real output file is selected.

## Authoring configuration boundary

`220 config` is an interactive, unprivileged macOS workflow. It requires a
normal non-root account and terminal input/output, invokes the fixed
`/usr/bin/vim` executable without a shell, and passes only the three catalogued
authoring paths after `--`. Arbitrary file selection is not part of its grammar.

In a checkout, those paths are the repository working copies at
`config/directives/aliases.u220a`, `config/printers/local.u220p`, and
`config/images/default.u220i`. In a managed installation, the release copies
are immutable factory templates. A configuration session exclusively seeds any
missing user files under an explicit absolute `TM_U220_CONFIG_HOME`, otherwise
an absolute `XDG_CONFIG_HOME/tm-u220`, with `$HOME/.config/tm-u220` as the
fallback. The relative destinations remain `directives/aliases.u220a`,
`printers/local.u220p`, and `images/default.u220i`; existing files are never
replaced by seeding. After Vim closes successfully, all three active files are
checked through the canonical alias, printer-profile, and image-profile parsers,
and invalid saved configuration is reported as an operational failure.

Before Vim opens, the configuration helper rejects symbolic links, extra hard
links, wrong ownership, unsafe writable modes, empty files, oversized files,
and unsafe configuration directories. Bundled templates remain covered by the
installed release manifest; mutable user copies deliberately are not
content-addressed release files. Their syntax is also validated whenever a
normal authoring command consumes them. Application removal deliberately leaves
these user-authored files in place.

This boundary cannot select or edit the root-owned printing manifest, physical
profile, privileged connection rules, or authorized endpoint. Those remain
under `220 printer setup|status|deauthorize` and their independent integrity
checks.

## Image-profile editor boundary

`220 image-profile IMAGE` starts a private loopback workspace for one direct
PNG, JPEG, or binary PBM image. The image path is resolved when the command
starts and remains fixed and read-only for that session. Browser requests cannot
choose another image, configuration path, or asset root.

Each draft is parsed by the canonical image-profile codec and compiled through
the normal direct-image pipeline. The live view therefore receives the same
final one-bit printer-dot mask and physical paper geometry used by compilation;
it does not perform a second browser-side image conversion. Revert restores the
saved profile. Save and Command-S atomically update only the active image-profile
file, with stale on-disk revisions rejected instead of overwritten.

The workspace returns preview geometry and diagnostics, not printer bytes. It
has no print or transport route and does not contact the configured printer.

## Status codes and diagnostics

- `0`: successful command or help output
- `1`: data, environment, or operational failure
- `2`: command usage failure
- `130`: controlled live-print cancellation

Usage failures produce one concise diagnostic and a help pointer. Application
diagnostics keep their structured domain codes. A child helper's usage status is
normalized to `2`; other helper failures retain their operational status.

## Change checklist

When adding or changing a command:

1. Change the command and option catalogs rather than adding parser branches.
2. Put domain-specific normalization in a small module outside token parsing.
3. Add the handler to the dispatcher registry and keep catalog/handler parity
   green.
4. Verify overview and focused help from the same descriptors.
5. Add a safe process-boundary contract test when public behavior changes.
6. Add every new runtime module to the installation payload.
7. Run `test/run-all`, which is the complete repository release gate.
