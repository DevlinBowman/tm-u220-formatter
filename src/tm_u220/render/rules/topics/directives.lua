-- Organizes canonical directives by hardware/system behavior before formatter
-- utilities, keeping shipped aliases beside the operations they expand into.
local REFERENCE = [=[
Printer-native and job-system directives:

  @profile variant=A|B|D paper=76|69.5|57.5 dip2_1=on|off
           cutter=partial|full|none
  @init
  @align left|center|right
    aliases: @left/@center/@right select the matching alignment
  @font a|b
    aliases: @font-a -> a; @font-b -> b
  @emphasis on|off
    aliases: @bold -> on; @bold on|off; @bold-off -> off
  @double-strike on|off
  @double-width on|off
  @double-height on|off
    aliases (width/height): @normal-size off/off, @wide on/off,
                            @tall off/on, @large on/on
    composite alias: @title -> center alignment, tall size, bold emphasis
  @underline off|single|double
    aliases: @underline/@ul -> single; @underline-double/@ul-double -> double;
             @underline-off/@ul-off -> off
  @color black|red
    aliases: @black -> black; @red -> red
  @upside-down on|off
  @spacing 0..255
  @line-spacing default|0..255
  @code-page 0|2|3|4|5|16|17|18|19
  state modifiers may prefix a complete text line: @center @bold TEXT
  @text TEXT
  @line
  @tab
  @feed 0..255
    alias: @lf N -> @feed N
  @feed-units 0..255
  @reverse-lines 0..255
  @reverse-units 0..255
  @cut installed|full|partial [feed=0..255]
    alias: bare @cut -> @cut installed
  @image PATH [WIDTH HEIGHT]
    WIDTH = 1..255 character cells or page; HEIGHT = 1..255 cells or auto
    PATH is relative to the file-backed job; quote paths containing spaces

Formatter-defined utilities:

  @rule PATTERN
  @kv LEFT | RIGHT
    alternate separators when no pipe is present: = ; : (final occurrence wins)
  @kv_start ... @kv_end
    valid implicit rows become @kv; all other lines keep their ordinary meaning
  @table [TABLE_ALIGN,]COLUMN[,COLUMN...]
    TABLE_ALIGN = L or R; default L
    WIDTH = a positive decimal integer
    COLUMN = WIDTH[CONTENT_ALIGN[GROUP]]
    CONTENT_ALIGN = L, C, or R; default L
    GROUP = L or R; default TABLE_ALIGN
  @head FIELD | FIELD [...]
  @row FIELD | FIELD [...]
  @end-table
  @fi

Alias configuration:

  Run 220 config to edit the active aliases, printer profile, and image
  interpretation profile.
  Shipped alias defaults: config/directives/aliases.u220a
]=]

return {
    summary = "all line, layout, style, motion, and cut directives",
    list = "220 directives - Valid job directives\n\n" .. REFERENCE .. "\n",
    text = "220 rules directives - Canonical job directives\n\n" .. REFERENCE .. [=[

@init, @align, @color, @upside-down, @image, @rule, @kv, all table directives,
@fi, and @cut require the beginning of a printer line. @text does not end its
line; @line does.
Ordinary source lines include their own line feed. Numbers are decimal integers.
@rule ignores surrounding horizontal padding, then repeats a non-empty printable
Unicode pattern, clipping its final repetition to fill exactly the current line.
TABLE_ALIGN aligns an unsplit table and supplies each column's default group.
A COLUMN's first suffix always controls content alignment; its optional second
suffix controls group placement. Thus @table 9,4,4 is wholly left, while
@table R,9,4,4 is wholly right. Use 4LR for left-aligned content explicitly
placed in the right group. Left-group columns must precede right-group columns.
Groups pack against opposite line edges with one-cell internal gaps and at least
one flexible cell between split groups. No column is implied.
@head and @row require one pipe-separated field per declared column; adjacent
pipes make an empty field. @end-table closes the layout.
@code-page locks following text to a public standard page for the current line.
A line, wrap, feed, reverse feed, cut, or @init releases the lock and the
printer returns to page 0; ordinary Unicode text continues to select pages
automatically from the same catalog. Values outside that catalog are rejected.
Directives may have horizontal indentation, spaces or tabs may separate a name
from its argument, and padding around validated arguments is ignored. @text
preserves everything after its first separating space or tab as literal data.
Spaces around profile/cut "=" and around @kv separators are optional. @kv uses
its pipe when present; otherwise its final "=", ";", or ":" separates the fields.
For consecutive rows, exact whole-line @kv_start and @kv_end markers try each
undeclared line as @kv. Accepted rows use canonical @kv behavior; rejected rows
keep their ordinary meaning, including blank lines, comments, text, and other
directives. An explicit @kv remains strict. Markers may be indented, cannot
nest, and must be paired.

A source-line directive prelude may continue with another @directive once the
current directive's canonical arguments are complete. Pipes are optional:

  @font a @emphasis on @double-width on @underline double
  @center @bold Receipt

An unescaped pipe makes a boundary explicit. Before another @directive it
continues the prelude; before ordinary text it ends the prelude and is omitted:

  @font a | @emphasis on | @double-width on
  @align center | Receipt
  @text 0 | @tab | @text 8 | @tab | @text 16 | @line

Each directive runs left to right as though on a separate source line. State
modifiers may then prefix ordinary text and its line feed. The longest valid
argument form wins: "@bold off Text" differs from "@bold Text". Once text
begins, its complete tail is literal, except that a final @init is a postlude:

  @title Receipt @init
  @title Receipt | @init

Both forms feed the ordinary text line before resetting at the next line's
beginning. A nonterminal @init remains literal text.
In @text, an explicit pipe before another directive is reserved; write "\|" to
emit that pipe literally.
@image, @kv, and all four table directives own their source line and cannot be
sequence members. @kv, @head, and @row keep their pipes as field separators.
Placement, ordering, and hardware restrictions still apply to every directive
in the prelude.
Size aliases are absolute presets and set both width and height.
@title selects center alignment, absolute tall size, and bold emphasis.
Modifier state remains active after prefixed text until changed or reset.
Actions such as @feed, @cut, @fi, and @init do not accept prefixed text; terminal
@init is a postlude to an already complete ordinary line.

The active aliases include the inline names above. In the aliases file, a
mapping uses "@name == @canonical value"; "@name * == @canonical *" forwards
arguments. Every target must use canonical syntax. A target sequence uses the
same " | @" separator shown above.

Every cut advances to the physical cutter position before cutting. @fi is a
reusable shorthand for @feed 4, @cut installed, then @init; it may repeat and
later output begins from printer defaults. Because it initializes, @fi is not
valid inside an active table. @cut feed=N instead adds N units of 1/144 inch at
the cutter position.
]=],
}
