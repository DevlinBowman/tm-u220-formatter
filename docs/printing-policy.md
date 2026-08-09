# Printing policy, setup, and security

Local printing has one machine-owned source of truth. The application contains
no account name, printer address, or checked-in sudoers rule. Setup derives a
policy from the current non-root account, an explicit private IPv4 address, one
selected physical-printer profile, and recorded setup evidence. LPD, live RAW,
the package reviewer, and the status command all consume that same manifest.

## First-time setup

Run setup as the ordinary account that will print:

```sh
220 setup-printing
```

The native macOS assistant asks for the host and requires an explicit choice
between the included profile and another `.u220p` file. The host must be a
canonical numeric RFC 1918 or link-local IPv4 address. The selected profile's
variant, paper width, DIP 2-1 state, and cutter must agree with the physical
printer. Setup rejects root execution and
records both the account name and numeric UID; sudoers authorization uses the
numeric UID so an account rename cannot silently transfer or break the grant.

To supply the two selections without opening the selection assistant, use:

```sh
220 setup-printing --host 192.168.1.40 --profile default
```

`default` resolves from the running application release, independent of the
terminal's current directory. A custom absolute or relative `.u220p` path is
also accepted. Policy review and Apple Installer remain interactive.

Setup follows these ordered gates:

1. Check the fixed macOS tools and inspect every existing managed path without
   following symlinks.
2. List effective sudo permissions non-interactively. Unknown files, broad or
   weak passwordless netcat access, and unrecognized extra commands stop setup.
3. Record the selected address and the reason device contact must wait until the
   privileged-source authorization exists.
4. Generate one canonical manifest, profile copy, sudoers rule, and legacy
   tombstone in a private temporary directory.
5. Build and re-inspect a script-free package: exact archive entries, types,
   modes, numeric ownership, checksums, BOM, `PackageInfo`, lack of scripts, and
   unsigned state are all validated before review.
6. Embed the immutable validated package and review resources, ad-hoc sign the
   local reviewer app, and verify that signature immediately before launch.
7. Require the operator to open the complete byte-level review. Apple Installer,
   not the reviewer or formatter, presents the administrator authorization UI.
8. Re-audit installed hashes, metadata, manifest/profile binding, exact package
   receipt version, and every effective command. Installer closure alone is not
   treated as success.

The bare command always opens the assistant. Any supplied option skips that
selection assistant; omitted values may be reused from a healthy canonical
policy, but a first-time or legacy machine must supply every missing choice.

## Device checking

This TM-U220 does not respond to an ordinary workstation connection. Setup must
therefore install the reviewed privileged-source-port authorization before it
can make a meaningful device check. The new manifest records
`probe_mode=deferred` and `probe_reason=privileged_source_required`; this is an
explanation of the bootstrap order, not a claim that the device was verified.

After installation, `220 printing-status --check-device` uses the exact live
route in that manifest and the installed passwordless connection rule. Its byte
allowlist is:

| Purpose | Bytes |
| --- | --- |
| model name | `1D 49 43` |
| model-family ID | `1D 49 01` |
| printer status | `10 04 01` |
| offline status | `10 04 02` |
| error status | `10 04 03` |
| paper status | `10 04 04` |

None is printable data or a feed, cut, initialization, or drawer command. A
successful result requires exact model name `TM-U220` and model ID `0D`.
Readiness is reported separately: cover-open, paper-out, printer-error, or an
unavailable status response does not erase a valid identity, but it prevents a
status report from claiming ready. Malformed identity or status responses fail
closed.

Schema-version-1 manifests produced by an earlier development build may contain
`verified` or explicitly accepted `offline` evidence. They remain readable for
inspection and migration, but current setup does not create those modes and has
no offline-waiver option.

## Installed artifacts

| Path | Owner | Mode | Purpose |
| --- | --- | --- | --- |
| `/private/etc/tm-u220/printing.conf` | root:wheel | `0444` | strict canonical machine manifest |
| `/private/etc/tm-u220/printer.u220p` | root:wheel | `0444` | exact selected physical profile |
| `/private/etc/sudoers.d/tm-u220-live-raw` | root:wheel | `0440` | sole live and LPD command allowlist |
| `/private/etc/sudoers.d/tm-u220-lpd` | root:wheel | `0440` | inert migration tombstone; no command grant |

The package identifier is `org.tm-u220.printing-policy`. The package contains
only these four regular files and required parent-directory records. It has no
preinstall/postinstall script, executable helper, launch item, daemon, service,
or formatter code.

The manifest fixes the product-level route shape while retaining machine-level
choices separately:

- live: destination port 9100, 30-second timeout, source ports 1023 and
  1021 through 1015;
- LPD: queue `lp`, destination port 515, five-second timeout, source ports 731
  through 721;
- machine choice: one validated private IPv4 address, one account/UID, one
  profile hash, and one setup-evidence record.

Changing the host, account, or physical profile requires another reviewed setup
run. Ordinary local print flags cannot redirect these routes. Advanced
`--transport raw-tcp` remains a separate explicit, unprivileged route and does
not consume the local policy.

## Inspecting from the CLI

```sh
220 printing-status
220 printing-status --json
220 printing-status --check-device
```

The default command is local-only and never requests authorization or opens a
printer connection. It reports:

- supported platform and every fixed executable dependency;
- root:wheel `0755` non-symlinked ancestry for every managed path, plus an exact
  two-entry allowlist inside `/private/etc/tm-u220`;
- existence, type, link count, owner, group, mode, size, readable hashes, and
  schema status for each artifact;
- package identifier and exact installed receipt version;
- expected, active, missing, misconfigured, broad, and extra passwordless
  netcat commands;
- a distinct finding for the historical source-port 1022 LPD grant;
- installed account, endpoint, profile, and device-evidence record.

`--json` emits schema `tm-u220-printing-status` version 1. Exit status is 0 only
when the complete local policy is healthy, 1 when attention is required, and 64
for invalid status options. `--check-device` is the only status option that
performs network I/O. It uses the installed privileged-source bypass, and its
identity/readiness result participates in health.

## Security boundary

The sudoers rule authorizes exactly 19 command lines as root with `NOPASSWD`,
`NOEXEC`, and `NOSETENV`. Every line fixes `/usr/bin/nc`, timeout, privileged
source port, destination IPv4, and destination port. It never elevates `220`,
Lua, Node, Perl, a shell, the package reviewer, or an editable helper path.

That boundary is intentionally narrow, but it is not a content sandbox. The
authorized account can invoke an allowed netcat command directly and supply any
standard-input bytes to the fixed printer endpoint. Port 9100 and LPD port 515
are plaintext and unauthenticated: they do not provide confidentiality, printer
authentication, replay protection, or payload integrity against the local
network. Use a trusted, isolated printer network; do not select an address shared
with an unrelated service; and remove the policy when the machine no longer
prints there.

The locally generated package is deliberately unsigned because its payload is
different for every account, address, profile, and evidence record. Its complete
bytes and SHA-256 are reviewed immediately before launch and independently
validated afterward. A broader public distribution can sign the unprivileged
application bundle, but should continue generating this per-machine policy
locally rather than shipping a universal sudoers grant.

## Legacy migration and removal

Setup recognizes only the historical TM-U220 command shapes: the eight live
commands, optionally the eleven current LPD commands, and optionally the single
stale LPD source-port 1022 command. They must share one valid private address and
retain root-only `NOPASSWD`, `NOEXEC`, and `NOSETENV` scope. Anything else stops
for manual review. Migration replaces the canonical sudoers path and overwrites
the old LPD path with a reviewed inert tombstone, so the stale grant cannot
remain effective.

Removal has its own inspectable lifecycle. Preview it first as the ordinary
account that owns the installed policy:

```sh
220 remove-printing
220 remove-printing --json
```

The default is a read-only dry run. It audits the same canonical paths and
effective permissions as setup/status, then displays all four fixed artifact
paths, every effective command that would be revoked, the package-receipt
action, the empty-directory action, every exact administrator command vector,
and residual security considerations. It neither contacts the printer nor asks
for administrator authorization.

Automatic removal is available only when the starting state is either a fully
healthy canonical installation for the invoking account or one exact legacy
shape accepted by migration. It refuses unsafe path ancestry, unmanaged files,
wrong owner/mode/type/link metadata, another installed account name or UID,
uninspectable effective permissions or receipt state, missing/weak/broad grants,
and unrecognized commands. A refused dry run makes no changes.

To execute the disclosed plan, add the sole mutation flag:

```sh
220 remove-printing --remove
220 remove-printing --remove --json
```

The invoking account must itself be permitted to use `sudo`; command-line sudo
cannot accept a different administrator identity on that account's behalf. If
the printing account is not allowed to administer the Mac, an administrator
must first establish an approved local removal procedure rather than sharing a
password or running the entire application as root.

The helper never elevates `220`, Lua, Node, or a generated/editable script. For
each action it invokes `/usr/bin/sudo` with shell execution disabled and one
fixed executable/argument array. It removes the two sudoers paths followed by
the manifest and profile when present, validates the remaining sudoers
configuration, forgets the canonical receipt when present, and removes the
application policy directory only when empty. It stops at the first failed
administrator action, does not attempt or claim rollback, and always attempts a
fresh audit afterward. A complete result requires all four artifacts, the
receipt, the application policy directory, and every previously audited grant
to be verified absent; broad or newly unrecognized netcat authorization also
prevents a success claim.

For `220 remove-printing`, exit 0 means a dry-run plan was produced or removal
was completely verified, exit 1 means the state was refused or removal remains
incomplete, and exit 2 means the top-level `220` syntax was invalid. The direct
internal helper reserves exit 64 for its own argument errors.

The application itself remains installed after policy removal, advanced
unprivileged raw TCP remains available, and bytes already sent cannot be
recalled. Unrelated sudoers rules, receipts, accounts, and network settings are
left untouched. `220 printing-status` will then intentionally report an absent
and therefore non-ready printing policy. Removal never contacts the printer.
