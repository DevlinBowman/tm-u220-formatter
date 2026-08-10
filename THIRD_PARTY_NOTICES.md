# Third-party notices

## jpeg-js decoder

The deterministic JPEG image path includes only the unmodified decoder from
[`jpeg-js` 0.4.4](https://github.com/eugeneware/jpeg-js). It is shipped as
source inside the isolated image-materialization helper; the encoder, package
entry point, declarations, and development files are not distributed. No npm
installation is performed at runtime.

The package identifies itself as BSD-3-Clause, while the decoder retains the
Apache-2.0 copyright and license header from its `jpgjs` lineage. Both complete
license texts accompany the decoder:

- [BSD-3-Clause](libexec/image_assets/jpeg/vendor/jpeg-js-0.4.4/LICENSE.BSD-3-Clause)
- [Apache-2.0](libexec/image_assets/jpeg/vendor/jpeg-js-0.4.4/LICENSE.Apache-2.0)

The reviewed package URL, package hash, exact decoder hash, and scope are
recorded in the decoder's
[provenance file](libexec/image_assets/jpeg/vendor/jpeg-js-0.4.4/PROVENANCE.md).

## Unicode character mapping data

The generated Lua mappings for PC437, PC850, PC852, PC860, PC863, PC865,
PC866, and Windows-1252 use character mapping data published by Unicode, Inc.

Copyright © 1991–2026 Unicode, Inc. The mapping data is licensed under the
[Unicode License V3](LICENSES/Unicode-3.0.txt) (`Unicode-3.0`).

The inputs were retrieved from Unicode's public mapping directories on
2026-08-09. The generator verifies these exact SHA-256 digests before writing
any repository file:

| Input | SHA-256 |
| --- | --- |
| [CP437.TXT](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP437.TXT) | `6bad4dabcdf5940227c7d81fab130dcb18a77850b5d79de28b5dc4e047b0aaac` |
| [CP850.TXT](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP850.TXT) | `ffdcc3c1c72f1aef600a63547100ef3dc452a09ad84923d382085519751c7479` |
| [CP852.TXT](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP852.TXT) | `440d098e9f2b79eeacbe2bbc1814960b6554c885740615047f5b528c2947afb6` |
| [CP860.TXT](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP860.TXT) | `1b3f983eac02d9ae9fc28106f2f3476ca1e4b337c7287f1a004372e14dd11e6a` |
| [CP863.TXT](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP863.TXT) | `f467a2a652ce3f74bb3fa86c8767dd06cbde90edfb73bf3a5541ae4cbe806d7b` |
| [CP865.TXT](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP865.TXT) | `e31eeb03a39a5fbdd5e23de60a22af4219c9987de2088386855ab20f273f470a` |
| [CP866.TXT](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP866.TXT) | `abcc96dd4253321eb5e542c1ece3adab10df0cc20ec5d1124a0cec22d636c924` |
| [CP1252.TXT](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1252.TXT) | `f607ae328b4dff5e9bfef725f5fff0ae23f38797f8a5b95998a0d2735c0e8fad` |

The generated outputs are the nine modules under
`src/tm_u220/charset/pages/`, the browser-safe PC437 descriptor at
`web/charset/page-00-pc437.js`, and the public standard-page specimen in
`examples/chars.txt`. The PC437 matrix in `examples/example.txt` also contains
Unicode-derived mapping data. Regenerate the modules, browser descriptor, and
standard-page specimen with:

```sh
node dev/charset/generate_standard_pages.mjs PATH_TO_MAPPING_FILES
```

PC858 is generated from the pinned CP850 data with byte `D5` changed from
U+0131 to U+20AC. IBM documents PC858 as the euro-enabled PC850 variant and
identifies the euro replacement at `D5`; no Epson character-table data is used
for that transformation. See IBM's
[code-page overview](https://www.ibm.com/support/pages/zvm/euro/codepage.html)
and [code-set conversion reference](https://public.dhe.ibm.com/s390/zos/vse/pdf3/LE_Code_Set_Conversion.pdf).

Control bytes are omitted because they are printer operations, not document
text. Undefined source positions remain unmapped. The standard non-breaking
space mappings are retained.
