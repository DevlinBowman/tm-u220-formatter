# Security policy

TM-U220 Formatter deliberately separates unprivileged receipt authoring from
the machine-specific printing policy. Security reports involving that boundary,
the installer, path validation, command authorization, or network delivery are
especially welcome.

## Supported versions

Security fixes are made against the latest release and the current `main`
branch. Older releases may need to upgrade before receiving a fix.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting flow from the repository's
**Security** tab. Do not include exploit details, private network information,
or printer-policy files in a public issue.

If private vulnerability reporting is not yet enabled, open a minimal public
issue asking the maintainer to enable a private reporting channel. Do not put
the vulnerability itself in that issue.

Include the affected version, impact, reproduction conditions, and the smallest
safe proof of concept you can provide. Reports should use synthetic addresses
and redacted policy data.

## Scope

The project's security boundary and intentionally authorized capabilities are
documented in [the printing policy](docs/printing-policy.md). Printer firmware,
printer hardware, macOS, Node.js, Lua, and network services outside this
repository should be reported to their respective maintainers.
