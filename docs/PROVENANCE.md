# Provenance

This record separates project-authored work, permissively licensed data, and
external compatibility references. It is part of the release gate: material
with unresolved redistribution rights must not enter a public release.

| Material | Origin and method | License or status |
| --- | --- | --- |
| Application code, tests, documentation, UI, and project-authored portions of examples | Authored in this repository by DevlinBowman and contributors | MIT |
| `jpeg-js` 0.4.4 decoder | Unmodified decoder-only source from the pinned package; exact package and file hashes are in the [vendor provenance](../libexec/image_assets/jpeg/vendor/jpeg-js-0.4.4/PROVENANCE.md) and its distribution scope is recorded in [third-party notices](../THIRD_PARTY_NOTICES.md) | BSD-3-Clause package terms and retained Apache-2.0 decoder notice |
| Standard character-page modules and browser-safe PC437 descriptor | Deterministically generated from pinned Unicode mapping files; exact inputs and hashes are in [third-party notices](../THIRD_PARTY_NOTICES.md) | Unicode-3.0 data in project-authored Lua and JavaScript containers |
| PC858 character-page module | Generated from pinned Unicode CP850 data with the documented `D5` euro substitution | Unicode-3.0 data plus a project-authored transformation |
| `examples/chars.txt` | Deterministically regenerated from the public standard-page mappings | Generated artifact; same mapping-data terms as its inputs |
| `examples/example.txt` | Project-authored capability sheet; its PC437 character matrix is derived from the generated standard-page mapping | MIT for project-authored portions; Unicode-3.0 for derived mapping data |
| Character-data scope | Only the standard mappings identified in the third-party notices are distributed | Additional device-vendor mappings are outside project scope |
| Preview Font A/B strike atlases | Printable ASCII was manually authored from magnified physical TM-U220 printouts; sparse PC437 extensions are independently authored in the checkout-only glyph workspace | Project-authored approximate preview data, MIT |
| `docs/assets/preview.png` | Captured from this project's local browser UI using `examples/coffee_receipt.u220` on 2026-08-09 | Project-authored media, MIT |
| Epson manuals and web references | External links used to describe compatible device behavior and command facts | Not redistributed and not licensed by this project |

## Preview strike atlases

The author produced physical TM-U220 printouts from project-authored printable
ASCII test text, inspected the individual dot strikes under magnification, and
entered the approximate 9×9 Font A and 7×9 Font B masks manually. Sparse PC437
extension files contain only masks subsequently authored through this project's
checkout-only glyph workspace; the Unicode mapping supplies labels and byte
identity, never bitmap shapes. These files were not extracted from printer
firmware or ROM and were not traced from Epson documentation, websites,
software, or marketing images. They are representative preview assets, not
Epson resident-ROM font data.

## Character-data scope

This project distributes only the standard mappings identified in
[third-party notices](../THIRD_PARTY_NOTICES.md). Additional device-vendor
character mappings are outside the project's distribution scope.
