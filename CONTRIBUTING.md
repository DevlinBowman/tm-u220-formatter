# Contributing

Thank you for helping improve TM-U220 Formatter. Changes should preserve the
project's strict boundaries: formatting stays independent from transport,
machine policy stays separate from authoring configuration, and cross-domain
coordination belongs in the application layer.

By submitting a contribution, you agree that it may be distributed under the
MIT License and any applicable third-party terms identified in this repository.

## Before opening a change

- Use Lua 5.3 or newer and Node.js 20.11 or newer on macOS.
- Read the [architecture](docs/architecture.md) and the relevant focused guide.
- Keep modules small and grouped by responsibility.
- Add a one- or two-sentence intent comment at the top of each script.
- Add tests alongside the domain whose contract changes.

Run the complete release gate from the repository root:

```sh
test/run-all
git diff --check
```

Tests must not contact a real printer, modify an installed printing policy, or
require administrator privileges. Use the existing injected adapters and
temporary artifacts for those boundaries.

## Third-party and Epson material

Do not contribute copied manual text, documentation tables, sample code,
screenshots, logos, firmware, ROM data, or reconstructed resident fonts from
Epson materials. Link to official documentation when a specification source is
needed. Character mappings outside the public standard catalog are out of
scope. Changes to distributed standard mappings must preserve the pinned-source
generation method and update the provenance and license records.

Use EPSON, ESC/POS, and TM-U220 names only where needed to describe
compatibility. Contributions must not imply sponsorship, endorsement, or an
official relationship with Epson.
