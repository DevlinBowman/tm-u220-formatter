# Printer settings discovery

The formatter separates facts the printer can report from physical choices that
must be recorded explicitly. It never fills an unknown field with a convenient
default.

## Supported queries

The discovery API and `profile-queries` command expose these Epson `GS I`
requests:

| Query ID | Request bytes | Meaning |
| --- | --- | --- |
| `gs_i.model_id` | `1D 49 01` | one-byte model-family ID |
| `gs_i.type_id` | `1D 49 02` | one-byte feature/type ID |
| `gs_i.model_name` | `1D 49 43` | `_`-prefixed, NUL-terminated model name |
| `gs_i.language_font` | `1D 49 45` | `_`-prefixed, NUL-terminated language font |

List the requests without opening a printer connection:

```sh
220 profile-queries
```

Decode a response captured as hexadecimal bytes:

```sh
220 profile-decode gs_i.model_name model-name.hex
```

Use `--input raw` when the response file contains the original binary bytes.
Decoding is strict: wrong framing, extra bytes, unknown model names, and unknown
language strings are errors.

## Bidirectional exchange rule

Send exactly one query and receive its complete response before sending the next
query. The connection must allow bytes to return from the printer. A print queue
or one-way spooler may accept output while hiding query responses, so settings
discovery belongs on a bidirectional serial or raw network transport.

The query definitions and response decoders intentionally perform no I/O. A
transport supplies response bytes to:

```lua
local Discovery = require("tm_u220.profile.discovery")
local query = assert(Discovery.query("gs_i.model_name"))

-- response = transport.exchange(query.request)
local fact, err = Discovery.decode(query.id, response)
```

This boundary lets the same strict decoder work with serial, USB pass-through,
or raw TCP without embedding connection assumptions in the printer model.

Printing setup deliberately performs no pre-authorization network check. This
printer does not respond to an ordinary workstation connection, so setup first
installs the reviewed, privileged-source-port bypass. Afterward,
`220 printing-status --check-device` may use that bypass to send only model name,
model ID, and four DLE EOT status queries. Those queries contain no printable,
initialization, feed, cut, or drawer bytes. See
[printing policy and security](printing-policy.md#device-checking).

## What can be established

- Exact model name `TM-U220` can be confirmed. Model-family byte `0D` alone is
  insufficient because it is also associated with TM-U220II.
- The type byte reports whether an autocutter is installed. No autocutter
  resolves Type D; an autocutter leaves Type A versus Type B ambiguous.
- A documented language-font response can be recorded.

## What remains explicit

The supported TM-U220 `GS I` replies do not establish:

- Type A versus Type B when an autocutter is present
- loaded paper width
- DIP switch 2-1 character-spacing/column mode
- installed full versus partial physical cutter shape

Record those facts in a checked `.u220p` file. They determine layout and cut
validation, so compilation refuses to guess them.

The implementation follows Epson's [GS I command reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_ci.html)
and [TM-U220 supported-command list](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/tmu220.html).
