# Live CLI printing

Add `--live` to use the local TM-U220's controllable bidirectional RAW service.
Plain `220 print` uses the faster whole-job LPD route instead. In either mode,
the job is fully resolved, validated, laid out, and encoded before any connection
is opened. A compilation error therefore sends no printer bytes.

```sh
220 print receipt.u220 --live
220 print --text "one literal live line" --live
220 print receipt.u220 --live --silent
```

The live terminal view keeps a colored status dot visible and prints each
canonical preview line only after the printer confirms its operation. Color is
never the only signal: every state also has a text label. Redirected output and
`NO_COLOR` use plain append-only status text.

The indicator reports connection and checkpoint progress. It samples online,
cover, error, and paper state before printing, then receives paper-sensor status
at every checkpoint. It is deliberately not a concurrent SNMP watcher: the
earlier parallel watcher interfered with LPD sessions. A later cover, cutter, or
connection failure stops the live session and may leave only the current
operation's physical outcome unknown.

`--silent` requires `--live` and suppresses confirmed receipt lines only. It does
not remove checkpoints, hide status or errors, or disable cancellation.

## Checkpoint contract

The compiler records safe boundaries after line, feed/reverse-feed, and cut
operations. The live planner partitions encoded node bytes only at those
boundaries and verifies this invariant before connecting:

```text
concatenate(all checkpoint payloads) == compiled job bytes
```

For every step, the session writes its payload followed by Epson `GS r 1` and
waits for one valid paper-status byte. The next step remains in the host until
that response arrives. `DLE EOT` preflight queries establish online, cover,
error, and paper state before the first job byte.

This ordered wait is also why `--live` is slower: the printer cannot keep later
lines buffered while the host waits for each operation's confirmation. Default
LPD keeps the whole job available to the printer and therefore runs continuously.

Press `c` or Ctrl-C to request cancellation. The session waits for an operation
already in flight, then closes without sending later operations. If the response
is lost, that one operation's outcome is reported as unknown and is never
retried; every later operation is definitely unsent.

Checkpoint confirmation means the printer reports that the ordered operation
ended. It cannot prove that the ribbon transferred ink to paper.

## Default whole-job transport

Plain printing submits one whole job through the fixed local LPD queue. The live
route never silently falls back to it; choosing `--live` remains explicit:

```sh
220 print receipt.u220
220 print receipt.u220 --transport lpd
220 print receipt.u220 --transport raw-tcp --host PRINTER
```

LPD retains its five-stage acknowledgement contract. Advanced one-shot RAW
retains its existing ambiguous-interruption behavior.

## Privileged local connection

The printer requires a privileged local TCP source port. Live mode rotates
internally during connection startup only through the eight ports fixed by the
installed canonical policy. Every authorization entry targets the one private
IPv4 address recorded during setup on port 9100; the Node controller and the
ordinary CLI remain unprivileged.

On the configured workstation, run the command directly:

```sh
220 print --text "one controlled test line" --live
```

Do not run `sudo 220`: that needlessly elevates the compiler and brings back a
password prompt. To inspect or install the narrow rule, run:

```sh
220 setup-printing
220 printing-status
```

Setup does not contact the printer before authorization because this hardware
will not answer an ordinary connection. **Review Exact Policy** shows all
manifest, profile, sudoers, and legacy-tombstone bytes, destinations, metadata,
the explicit deferred-check reason, and package fingerprints. Continuing hands
authorization to Apple Installer. After installation,
`220 printing-status --check-device` can send identity/status queries through
the exact installed bypass.
The locally built package is unsigned and script-free; it has no executable
helper or daemon. The tombstone replaces the older standalone LPD grant so only
one authorization source remains. See the full
[printing policy and security model](printing-policy.md).

After a healthy `220 printing-status`, `220 print --live` elevates only one exact
`nc` connection without prompting. No test suite installs policy or contacts a
real printer.
