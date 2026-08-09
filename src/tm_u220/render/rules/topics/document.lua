-- Explains automatic file resolution and the two explicit string input types.
return {
    summary = "raw --text and interpreted --ftext string input",
    text = [[
220 rules document - Interpreted and plain input

Default mode interprets an existing ordinary file or a quoted text argument.
Canonical @directives execute automatically; no header is needed. Ordinary lines
and # headings still print.

  220 render notes.txt
  220 print "hello from the printer"
  printf '12345\n12345\n@fi' | 220 print

With no input argument, check, compile, render, and print read interpreted
standard input through EOF. A positional - selects the same stream explicitly.
The producing command belongs on the left side of a shell pipe and 220 on the
right.

The CLI exposes two value-taking string inputs. --text TEXT compiles TEXT as raw,
plain text, so directives, headers, and comments cannot execute. --ftext FTEXT
applies the same interpreter used after loading an existing file. Neither value
is ever opened as a path, even when a readable file has the same name.

  220 print --text "@emphasis on"
  220 render --ftext "@emphasis on | @text Styled | @line"

The forms are mutually exclusive and cannot accompany a positional input. Both
types remove the UTF-8 BOM and preserve valid Unicode. Standard-model resident
glyphs select their code page automatically; unavailable glyphs print as ? with
a warning. Unlocked ASCII returns the printer to its default code page.
]],
}
