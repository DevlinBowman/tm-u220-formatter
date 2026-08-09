# Local LPD printing

Plain `220 print` uses the fast whole-job LPD route by default:

```sh
220 print receipt.txt
220 print receipt.u220
220 print "hello from the printer"
printf '12345\n12345\n@fi' | 220 print
```

Default mode interprets canonical directives in any existing file or quoted
non-file argument. A versioned job header is accepted but optional. `--text TEXT`
prints a supplied string literally. `--ftext FTEXT` interprets a supplied string
exactly like file contents. Neither option treats its value as a path. Valid
UTF-8 is preserved and mapped through resident printer pages; an unavailable
scalar prints as `?` with a warning. Compilation uses
`config/printers/local.u220p` unless `--profile` selects another profile.

`check`, `render`, `compile`, and `print` all use this same resolver, including
their shared `--text` and `--ftext` string inputs. The difference is what
happens after successful resolution and compilation—not how input is classified.
With no input argument, these commands read interpreted standard input through
EOF; a positional `-` makes that choice explicit. The producer belongs on the
left side of a shell pipe and `220` on the right.

LPD use does not require a pipe, leading `sudo`, host, queue, source-port, or
transport flags. One strict installed manifest supplies the address and
physical profile, while product policy fixes the remaining route:

- printer: validated private IPv4 selected during setup
- protocol destination: TCP port `515`
- LPD queue: `lp`
- local source ports: RFC 1179 reserved pool `731` through `721`
- network timeout: five seconds

The privileged source-port pool requires operating-system authorization. Run
`220 setup-printing` once to choose the device through the macOS assistant,
review the exact policy, and install the narrowly enumerated local connections.
Only after that policy exists can an explicit device check use the required
privileged source port.
Inspect them at any time with `220 printing-status`; its default is local-only.
The CLI uses the connections internally without a password prompt. It does not
grant the formatter general passwordless `sudo`, start a daemon, or authorize
arbitrary hosts and commands. See the
[printing policy and security model](printing-policy.md).

## What one print does

The formatter resolves the ready input, validates the local printer profile,
lays out the receipt, and atomically compiles ESC/POS bytes. Only a successful
compilation reaches the transport.

The LPD transport then preserves that compiled payload as the literal data file
in one receive-job session. It sends five stages and waits for a zero
acknowledgement after each one:

1. select queue `lp`
2. announce the control file
3. send the control file
4. announce the data file
5. send the exact compiled data payload

If a reserved port is still quarantined from a prior TCP connection, the helper
may select another port only while waiting for the first receive-job
acknowledgement. At that point no control file or payload bytes have been sent.
After the first acknowledgement, any missing, negative, malformed, or timed-out
acknowledgement fails the command without retry because some or all of the
receipt may already have reached the printer. That avoids duplicate receipts.

## Meaning of success

Success means the printer's LPD service returned all five acknowledgements for
the submitted job. It is materially stronger than a blind socket write, but it
is not mechanical confirmation: it does not prove that paper moved, the ribbon
made a mark, or the completed receipt emerged. The command reports that
distinction instead of claiming a physical print outcome it cannot observe.

Checkpointed bidirectional RAW is available explicitly with `--live`; see
[controllable live printing](live-printing.md). One-shot RAW remains available
as an [advanced transport](raw-tcp-printing.md).
