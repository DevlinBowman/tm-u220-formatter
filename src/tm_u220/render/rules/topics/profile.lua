return {
    summary = "local printer geometry, widths, and hardware facts",
    text = [[
220 rules profile - Printer geometry and hardware facts

Normal commands use config/printers/local.u220p. This machine is Type B with
76 mm paper, DIP 2-1 off, a partial cutter, 40 Font B columns, and 33 Font A
columns. Select another saved profile with --profile printer.u220p.

  !tm-u220 profile 1
  variant=B
  paper=76
  dip2_1=off
  cutter=partial

An optional authored @profile contains the same four facts and must match the
selected saved profile. Width is recomputed as font, spacing, and double-width
state change. Preview uses that exact formatter geometry; it is not hardware
simulation. @cut installed always selects the saved physical cut shape.
]],
}
