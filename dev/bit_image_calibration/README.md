# TM-U220 bit-image calibration proof

This developer proof exercises the canonical dot-mask packer and ESC/POS
encoder with small synthetic patterns. It does not use the job formatter, an
image decoder, or a second handwritten `ESC *` implementation.

Generate the deterministic raw fixture without contacting the printer:

```sh
lua dev/bit_image_calibration/generate.lua --raw \
  > /tmp/tm-u220-bit-image-calibration.bin
```

After reviewing the target reported by `220 printing-status`, submit that exact
file through the checkout's policy-controlled LPD helper:

```sh
./libexec/tm-u220-lpd-session \
  < /tmp/tm-u220-bit-image-calibration.bin
```

The second command physically prints immediately on the configured TM-U220.
It requires the installed printing policy, sends the file unchanged, and does
not cut the paper. The proof ends with blank feed lines so it can be torn off.

## What a correct proof looks like

1. **Bit order:** eight thick steps descend from upper left to lower right.
2. **M=0 solid:** one uniformly filled rectangle has no missing columns.
3. **M=1 safe alternation:** a regular checkerboard prints without requesting
   horizontally adjacent double-density strikes.
4. **Two-band registration:** the outer frame and four vertical rails remain
   straight through the join between the two eight-dot bands, without a gap or
   overlap. This section enables unidirectional printing for stable alignment.

Every image band is followed immediately by canonical `ESC J 16` print-and-feed
motion. The proof does not alter line-spacing state or use `LF` between bands.

For a non-printing, human-readable byte review, use:

```sh
lua dev/bit_image_calibration/generate.lua --hex
```

The mode limits and the recommendation to use unidirectional printing for
multi-line images come from Epson's [ESC `*` command reference](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_asterisk.html).
