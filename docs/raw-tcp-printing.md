# Advanced RAW TCP printing

The normal local-printer path is the whole-job LPD connection described in
[local LPD printing](lpd-printing.md). Checkpointed bidirectional printing is an
explicit `--live` mode. One-shot RAW TCP is an advanced option for another
printer endpoint that exposes a compatible socket. It delivers an exact binary
payload while keeping all formatting upstream in the checked job compiler.

```sh
220 print examples/coffee_receipt.u220 \
  --transport raw-tcp \
  --host 192.168.192.168 \
  --profile examples/type_b_76.u220p
```

For RAW TCP, `--transport raw-tcp` and `--host` are required. The destination
port defaults to `9100`, the timeout to five seconds, the operating system
normally selects the local source port, and privilege escalation is off. An
explicit profile is prudent when the target is not the configured local
printer; the formatter will not infer remote hardware settings.

## Exact-byte boundary

The transport receives the compiler's final byte string. It does not add or
change:

- initialization
- style or code-page commands
- line spacing
- line endings
- feeds
- cuts

Those choices belong in the job and are checked against the printer profile.
In particular, there is no transport-level `--cut` switch.

## Legacy source-port compatibility

The old helper attempted local ports `1023` through `1016`. That behavior is
available only when requested:

```sh
220 print receipt.u220 --transport raw-tcp --host 192.168.192.168 \
  --profile printer.u220p --legacy-source-ports --sudo
```

These are privileged ports on common systems. Either run with suitable process
permissions or add the explicit `--sudo` option. Unlike the already-authorized
fixed LPD route, RAW TCP never invokes `sudo` by default. A single source port
can be selected with `--source-port`, or an ordered list with
`--source-ports 1023,1022,1021`.

Rotation occurs only when netcat reports a confirmed local bind collision. A
timeout, disconnect, or other ambiguous failure is never retried because some
or all receipt bytes may already have reached the printer; retrying could print
a duplicate.

## Meaning of success

A successful result means that the local RAW TCP submission completed. Port
9100 does not provide a print-job acceptance receipt, so the result always
records printer acceptance as unknown. It does not claim that paper moved, ink
was present, or the receipt physically printed.

The transport captures returned bytes rather than allowing them to leak into
the terminal. Settings-query response decoding remains a separate discovery
operation, described in [printer settings discovery](printer-settings.md).
