# Why printer authorization comes before device checking

The TM-U220 used by this application does not respond to ordinary workstation
connections. It must be contacted from a privileged local source port. An
ordinary TCP failure therefore does **not** establish that the printer is
absent, offline, or configured at the wrong address.

This creates a bootstrap dependency:

1. The user runs `220 setup-printing` as their normal account.
2. The macOS wizard records the printer's private IPv4 address and physical
   profile.
3. The reviewer shows the complete, exact passwordless connection policy.
4. Apple Installer requests administrator credentials once and installs that
   policy.
5. Device identity and readiness may then be checked through an authorized
   privileged-source connection.
6. Ordinary `220` commands continue running as the normal user. Only an exact
   `/usr/bin/nc` child connection is invoked through `sudo -n`.

Do not add an ordinary or unprivileged printer probe before step 4. On this
hardware it creates a circular requirement: setup refuses to install the
authorization because the printer cannot be reached without the authorization.

The installed bypass is intentionally narrow. It binds one numeric local UID
and one selected private or link-local IPv4 address. It permits only the fixed
`/usr/bin/nc` command lines needed for RAW port 9100 and LPD port 515 from the
reserved source-port pools. `NOEXEC` and `NOSETENV` apply. Lua, Node, Perl, the
formatter, and the user's shell are never granted general passwordless sudo.

Distribution must preserve the same order while allowing each machine to
choose its own account, address, and profile. Those choices belong in the
installed manifest and reviewed sudoers policy, never in runtime hardcodes.
Inspection and removal must remain available through `220 printing-status` and
`220 remove-printing` without requiring anyone to edit sudoers manually.

There is no runtime fallback to a historical developer address. Setup may
recognize the exact old sudoers shape solely to migrate it, but all printing
requires the canonical installed manifest. Removing that manifest therefore
removes the application's printer designation instead of silently reconnecting
to a developer's network.
