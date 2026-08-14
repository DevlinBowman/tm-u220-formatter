-- Provides copyable commands for the native U220 input boundary.
return {
    summary = "copyable checks, previews, compilation, and printing",
    text = [[
220 rules examples - Everyday commands

  220 rules
  220 check examples/example.txt
  220 render examples/example.txt
  220 print examples/example.txt
  220 render examples/plain_receipt.u220
  220 compile receipt.u220 -o receipt.bin
  220 compile receipt.u220 --hex
  220 render --text "@cut installed"
  220 render --ftext "@center @bold Styled"
  printf '12345\n12345\n@fi' | 220 print

File content and --ftext use the same interpreter. --text prints its string
literally. Neither string option resolves its value as a file path. With no
input argument, check, compile, render, and print read interpreted standard
input; a positional - selects it explicitly.
Run 220 render before a physical print when changing layout or finish behavior.
Use @fi wherever a four-line margin and installed-shape cut are wanted. It may
repeat, initializes after each cut, and leaves later output at printer defaults.
]],
}
