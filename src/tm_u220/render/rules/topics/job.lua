-- Documents strict U220 job framing, comments, and escaping.
return {
    summary = "interpreted jobs, optional strict header, and escaping",
    text = [[
220 rules job - Interpreted job source

Any file extension can use the built-in job language in default mode. A .u220
extension is conventional. The versioned strict header is accepted but optional
through the CLI:

  !tm-u220 job 1

In an interpreted job body, a column-one # starts a comment, ## prints one
leading #, and @@ prints one leading @. With an authored header, every preceding
# line is a framing comment; no other preamble is valid. Headerless input follows
the same body comment and escape rules.

Unknown directives, malformed arguments, and impossible layout stop compilation
before any printer bytes are produced.
]],
}
