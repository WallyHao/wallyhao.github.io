# org-lite Syntax Reference v0.1

This document specifies the org-lite syntax, recovery rules, and compatibility boundaries. For an introduction, see the [syntax guide](syntax.md); for executable examples, see [conformance examples](examples.md); for result types and interfaces, see the [document model](model.md).

## Formal rules

### R0. Characters, whitespace, and comparison

- Documents contain Unicode text and use UTF-8 for exchange. LF and CRLF are accepted, and the last line need not end in a newline. Invalid UTF-8 is an input error; bytes must not be silently discarded.
- A space is U+0020; horizontal whitespace is a space or U+0009 tab. Unless otherwise stated, a required separator has at least one horizontal whitespace character. Empty lines and lines containing only horizontal whitespace are blank.
- Inline whitespace uses Unicode `White_Space`, distinct from structural horizontal whitespace. A physical line is a source line; a logical line has its enclosing container indentation removed. Headings and footnote definitions must start in physical column 0.
- Full-width spaces, nonbreaking spaces, and zero-width characters do not replace required horizontal whitespace; zero-width characters are not silently removed. Indentation uses zero-based columns, spaces advance one column, and tabs advance to the next multiple of eight.
- `#+` keywords, block types, property keys, `PROPERTIES`, `END`, and link protocols ignore ASCII case. Checkbox characters, entity names, LaTeX commands and environments, footnote labels, property values, and link targets are case-sensitive.
- An identifier consists of one or more Unicode letters, decimal digits, `_`, `-`, `.`, or `:`, with no whitespace. `ID`, `CUSTOM_ID`, and footnote labels use identifiers; footnote labels cannot contain `:`. UUIDs are not required.
- For name comparisons of headings, explicit targets, `NAME`, and text searches, trim horizontal whitespace and collapse internal runs of it to one ASCII space. Comparison is case-sensitive, with no Unicode normalization. Heading comparison uses the original markup in the title.
- Parsing preserves the original text, including delimiters, indentation, newline types, trailing whitespace, duplicates, and unrecognized content. Decoding and dedenting produce interpreted values without rewriting the source.

### R1. Structure, precedence, and inline contexts

1. A document consists of content before the first heading and a heading tree; an empty document is valid.
2. A heading starts at physical column 0 with one or more `*`, horizontal whitespace, and an optional title. Its level is the number of asterisks; there is no syntax limit. Skipped levels are valid and the parent is the nearest preceding heading of lower level; missing levels are not invented.
3. A heading's body ends at the next heading. Its subtree ends before the next heading of equal or lower level, or at EOF. `TODO`, `COMMENT`, `[#A]`, progress indicators, and trailing tags remain title text.
4. Consecutive ordinary nonblank lines form a paragraph. A blank line or valid new structure ends it, without requiring a preceding blank line. Ordinary newlines are soft breaks; trailing `\\` is literal text.
5. After removing container indentation and leading horizontal whitespace, a horizontal rule contains at least five consecutive `-` and optional trailing horizontal whitespace only. `----` and `----- text` are paragraph text.
6. Closed literal regions are recognized before their contents: heading-like lines inside source, example, comment, standalone formula, or LaTeX environment regions do not create headings. Elsewhere a column-zero heading ends the current list, quote, or footnote definition.
7. Where allowed, line structures are recognized in this order: heading; immediately attached property drawer; block, LaTeX environment, or standalone formula; footnote definition; TITLE or affiliated keyword; comment line; table; horizontal rule; list; paragraph. A container's boundaries are determined before its interior is parsed.
8. Unknown `#+` lines and orphan closing markers are separate raw lines, not comments or parts of adjacent paragraphs.

Inline parsing proceeds left to right. At an ambiguous position the order is inline code or verbatim, formula or LaTeX command, complete bracket link, complete footnote reference, explicit target, named entity, emphasis, script, then text. A candidate consumes input only when it succeeds; see E2 for recovery.

| Context | Allowed interpretation |
| --- | --- |
| Body, list items, quote paragraphs, ordinary table cells, footnotes, headings | All supported inline syntax; standalone formulas and environments still follow their line rules |
| `TITLE`, `CAPTION` | Supported inline syntax, but no target definitions or nested line structures |
| Link descriptions and bracketed script contents | Formatting, scripts, entities, and inline LaTeX; no links, targets, footnotes, or standalone formulas |
| Link targets, target names, `NAME`, property values, footnote labels, code language | Literal values, with no recursive inline parsing |
| Source, example, comment, formula, and LaTeX contents | No nested Org parsing; only the corresponding delimiter and escape rules apply |

### R2. Lists and checkboxes

- An unordered item is indentation followed by `-` and horizontal whitespace. An ordered item uses one or more ASCII digits, `.`, and horizontal whitespace. Zero, leading zeroes, and nonconsecutive numbers are allowed and preserved. `+ `, indented `* `, `1) `, and `a. ` are not list markers.
- The first line may have no body. Let B be the marker's left column and C the position after the marker and all following horizontal whitespace; the checkbox is not part of the marker. In `10. [ ] Task`, B=0 and C=4.
- The first-line body after an optional checkbox is inline paragraph content. Nested blocks and tables start on later indented lines.
- Siblings in one list have the same B and list type. A change of type at B closes the old list and starts an adjacent list.
- Later nonblank lines indented to C belong to the item. A list marker there starts a sublist; continuations may also contain supported paragraphs, tables, quotes, or blocks. Remove C columns of container indentation before parsing; preserve any excess indentation.
- A line indented less than C ends the item and is reconsidered in the enclosing context; no parent items are invented. Column-zero headings follow R1.
- One blank line may separate item paragraphs or sibling items. Two consecutive blank lines end all list levels in the current context. Blank lines inside closed literal blocks do not count.
- Checkboxes occur only immediately after the marker and separator at the start of the first-line body. The exact forms are `[ ]`, `[X]`, and `[-]`, followed by horizontal whitespace or EOL. `[x]`, `[x ]`, and boxes later in the body are plain text. Their states are not recalculated from children.
- Description markers `::` and counters such as `[@5]` are ordinary text. If removing C columns cuts through a tab, its remaining columns become spaces in the interpreted value; the source tab remains intact.

### R3. Emphasis, inline code, and verbatim text

- Paired markers are `*`, `/`, `_`, `+`, `~`, and `=`. Content is nonempty, cannot begin or end with whitespace, and cannot cross a blank line, line structure, or enclosing inline-context boundary.
- An opening marker must follow the context start, whitespace, Unicode punctuation or symbol, or a Han character; a closing marker must precede the context end or one of those categories. Han uses Unicode `Script=Han`; punctuation and symbols use categories P and S. Thus `a*bold*b` is not bold, while `这是*重点*文字` is.
- `~` and `=` each occupy at most one physical line, interpret nothing inside, and close at the first valid matching marker. They have no internal backslash escapes. Use the other literal marker or a literal block if their own delimiter is needed.
- The other four emphasis forms may cross soft breaks within a paragraph and contain allowed inline nodes. Distinct styles may nest properly, but identical nested markers and crossing spans are forbidden. Complete child nodes are opaque to the outer marker.
- Parse from an opener to the first valid matching closer. If a child cannot close before its parent, treat its opening character as text. There is no general backslash escaping; use `=`, `~`, or an EXAMPLE block to preserve markup.

### R4. Scripts, entities, and LaTeX

**Scripts**

- `^` or `_` must follow an adjacent nonwhitespace base character or complete inline node. Consecutive scripts share the same base, as in `x_{i}^{2}`. Scripts inside math are LaTeX source, not Org script nodes.
- Suffixes can be `*`, balanced nonempty `{...}` or `(...)`, or a bare sequence with an optional initial sign. Bracketed content can contain balanced braces and parentheses and R1-permitted inline nodes, but cannot cross a paragraph.
- A bare sequence contains Unicode letters, decimal digits, commas, backslashes, and periods, may begin with `+` or `-`, and must end in a letter or digit. The longest valid prefix wins; trailing commas and periods stay text. `H_2O` has subscript `2O`; use `H_{2}O` for `2` alone.
- A complete underline takes precedence over a subscript. Scripts cannot cross an enclosing formatting boundary.

**Named entities**

- `\NAME` or `\NAME{}` starts with an ASCII letter followed by ASCII letters or digits. The longest full name is used and case matters. Use `{}` to separate an entity from following letters or digits, as in `\pi{}r`.
- Names and meanings follow the [Org Syntax v2 entity table](https://orgmode.org/worg/org-syntax.html), not user configuration. Known entities followed by empty `{}` remain entities; nonempty arguments are considered as LaTeX commands. Unknown names without arguments remain text. No implicit typography converts `--`, `---`, or `...`.

**LaTeX**

- Inline forms are `\(...\)` and `$...$`; display forms are `\[...\]` and `$$...$$`. Contents must include a nonwhitespace character, remain literal, and are neither validated as TeX nor executed.
- `\(...\)` may cross soft breaks within one paragraph and ends at the first unescaped `\)`; same-type delimiters do not nest.
- Single-dollar content has no edge whitespace and permits at most two soft breaks. The closing `$` must be followed by context end, whitespace, or Unicode punctuation other than ASCII `-`. `$ 5 $` and `$x$-axis` are not formulas. Try double-dollar first and never split `$$` into single-dollar openers.
- Display forms can occupy one or multiple lines in structural context. A multiline opener is the first non-horizontal-whitespace content on its logical line; after the closer only horizontal whitespace is allowed. Blank lines inside are valid. A display formula embedded in a paragraph is an inline literal formula node with display form.
- `\begin{ENV}` starts at logical line start with optional indentation; remaining content on that line belongs to the environment. ENV starts with an ASCII letter, continues with ASCII letters, digits, `-`, or `_`, and may end in `*`. Match case-sensitive nested begin/end markers with a stack; the matching `\end{ENV}` allows only trailing horizontal whitespace.
- Outside environments, an ASCII-letter `\COMMAND` with optional final `*` and one or more immediately adjacent balanced `{...}` or `[...]` arguments is literal LaTeX. Arguments may interleave and nest but cannot cross a paragraph. Known entities followed by empty `{}` take precedence; unknown commands without arguments remain text. Lone `\begin` and `\end` cannot substitute for valid environments.
- An odd number of immediately preceding backslashes escapes a delimiter or command start; an even number does not. Internal escapes are retained. Recognition requires no TeX or MathJax installation. Unclosed candidates recover under E2.

### R5. Links, locations, and images

- Links are only `[[target]]` or `[[target][description]]`. A target is nonempty, single-line, and has no leading or trailing horizontal whitespace. A description may be empty and cross paragraph soft breaks, but cannot contain a nested link.
- In targets and descriptions, `\[`, `\]`, and `\\` decode to literal brackets and backslashes; other backslashes remain. Escapes are handled before delimiter matching. Decoded characters do not become new delimiters or inline syntax. Targets are literal; descriptions follow the R1 inline context.
- A protocol begins with an ASCII letter, then ASCII letters, digits, `+`, `.`, or `-`, and `:`. Unknown explicit protocols do not become local names; paths without `file:` are not inferred as files.

| Target | Meaning |
| --- | --- |
| `http://...`, `https://...` | A web address with a nonempty host and no unencoded whitespace or control characters; no network check |
| `file:path` | Relative, absolute, or `~/` file path; a relative path without an origin remains pending |
| `file:path::selector` | A nonempty file path and a selector, as described below |
| `id:value` | A heading property `ID`, potentially in a caller-supplied document; no additional search suffix |
| `#value` | A `CUSTOM_ID` in the current document |
| `*heading` | A current-document heading by normalized name, independent of level |
| Other nonempty targets without a protocol | Search explicit targets, then `NAME`, then headings in the current document, without implicit full-text search |

- Split a file target at its first unencoded `::`; encode a literal path `::` as `%3A%3A`. Then decode valid `%HH` path bytes once as UTF-8. Lone `%` and invalid UTF-8 are preserved and diagnosed as `invalid-value`. `+` is not a space; environment variables and path contents are not executed.
- Selectors are positive decimal line numbers (one-based), `*heading`, `#CUSTOM_ID`, `/regexp/`, or other nonempty text. Selector text uses bracket-link escapes but is not percent-decoded. Digit-only values are line numbers, may have leading zeroes, and cannot be zero. Prefixed names and regexps must be nonempty. Plain text searches target, `NAME`, and heading first, then the first exact case-sensitive source substring. Empty, invalid, or out-of-range selectors retain the link with `invalid-value`.
- An explicit target `<<name>>` is nonempty, has no edge horizontal whitespace, and contains no `<`, `>`, or newline. Its contents are literal. `<<<name>>>` is ordinary text, not a target.
- Repeated headings, targets, `NAME`, `CUSTOM_ID`, or `ID` are not renamed. Multiple matches in the same candidate category are ambiguous. Unmatched links remain links; external resources or ID scopes not yet supplied remain pending. IDs search the current and caller-supplied documents without scanning the filesystem.
- A `file:` link with no description or selector and a case-insensitive `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.tif`, `.tiff`, or `.avif` suffix is an image candidate. Other paths remain file links. No file, network, or image-decoding check is implied. `file:` does not enable TRAMP or attachment management.

#### File-search regular expression subset

- Match Unicode code points without case folding or normalization. Treat CRLF as one LF for searching while preserving source mappings. Choose the earliest start and, at that start, the longest match. Captures are not returned.
- Support literal characters, `.` (any character except LF), line anchors `^` and `$`, grouping `(...)`, alternation `|`, and quantifiers `*`, `+`, `?`, `{m}`, `{m,}`, and `{m,n}`. Bounds are nonnegative ASCII integers with m ≤ n. Quantifiers apply to characters, classes, or groups and cannot be stacked; groups and alternatives cannot be empty.
- Support `[abc]`, `[^abc]`, and `[a-z]`; ranges use Unicode code point order. `-` is literal at the start or end and otherwise denotes a range; `^` negates only at the start. POSIX classes and class operations are unsupported.
- `\n`, `\r`, and `\t` denote controls; a backslash before a regex metacharacter makes it literal. Other escapes, including `\d`, `\w`, and `\1`, are invalid. Link-level escaping must still be applied around regex backslashes and brackets.
- Backreferences, lookarounds, inline flags, lazy or possessive quantifiers, and evaluation are unsupported. Validate the subset regardless of host regex library. A valid unmatched expression is `unresolved`; an invalid one is `invalid-value`.

### R6. Tables and column formatting

- A logical line beginning with `|` after leading horizontal whitespace is a table row. Consecutive rows form a table; blank or non-table lines end it.
- Literal `|` characters split cells; a final `|` is optional. Trailing whitespace after a final `|` is not another cell. `||` is one empty cell and `| a ||` has two cells.
- A separator requires a final `|` and one or more nonempty hyphen runs joined by `+`, as in `|---|` or `|---+----|`. Spaces are not allowed inside; `| - |` is a data row.
- Trim cell-edge horizontal whitespace before inline parsing. Unequal row lengths are valid; the maximum ordinary row width defines column count, and missing cells are interpreted as empty without rewriting the source. Separators neither determine column count nor imply a header.
- Every literal `|` splits first, including inside apparent links, formulas, or code. There is no `\|` escape. Use `\vert`, or `\lvert` inside LaTeX, for a pipe.
- A whole trimmed cell matching `<l>`, `<c>`, `<r>`, `<N>`, `<lN>`, `<cN>`, or `<rN>` is a column format marker. N is a positive ASCII decimal integer without leading zeroes; letters are lowercase. `<0>`, `<L>`, and `abc <r>` are ordinary text.
- Markers declare alignment and display-column width. The first declaration of each attribute wins; equal repeats are accepted and conflicting repeats are retained with `duplicate`. Layout, wrapping, and truncation are outside this syntax.
- A row containing at least one marker and otherwise only empty cells or markers is a format row. A marker cell in a mixed data row still contributes formatting but has an empty data value. `#+TBLFM:` is a raw line, not a calculation.

### R7. Metadata, properties, and affiliated keywords

- A keyword line has optional logical-line indentation, `#+KEY:`, optional whitespace, and a single-line value. Only `TITLE`, `NAME`, `CAPTION`, and the block delimiters in R8 are supported; other keywords are separate raw lines.
- `TITLE` is valid only at the outermost level before the first heading and may be empty. The first valid title wins; later ones are preserved and diagnosed `duplicate`.
- A property drawer must immediately follow a heading on the next physical line, without a blank, comment, or planning line. A heading has at most one; document-level drawers are unsupported.
- Opening and closing lines contain optional horizontal indentation and `:PROPERTIES:` or `:END:`, followed only by horizontal whitespace. Each property is `:KEY:` and an optional single-line value, with optional leading indentation. Keys contain ASCII letters, digits, `_`, `-`, or `+`, are case-insensitive, and cannot be `END`. Empty drawers are valid; blank or non-property lines are not.
- Trim horizontal whitespace from values and treat them literally. Only valid nonempty `ID` and `CUSTOM_ID` values participate in link resolution. Other keys, including `DIR`, `HEADER-ARGS`, `OWNER+`, and `X_ALL`, are static data, without attachment, execution, append, enumeration, or inheritance semantics.
- Duplicate keys are compared without ASCII case: preserve all, use the first, and diagnose later occurrences. An invalid first value is not replaced by a later value. A closed drawer containing an invalid line becomes one raw region; an unclosed drawer follows E2.
- `NAME` and `CAPTION` must immediately precede their content, at the same indentation, with no intervening blank, comment, or unrelated keyword. They may appear consecutively in either order and attach to paragraphs, whole tables or lists, SRC/EXAMPLE/QUOTE blocks, standalone formulas, and LaTeX environments; not headings, drawers, comments, or rules.
- `NAME` is nonempty, may contain internal spaces, and cannot contain square or angle brackets. `CAPTION` may be empty and parses R1 inline syntax. For repeated declarations of either type on one item, the first wins and later declarations get `duplicate`. Unattached declarations are raw lines with `orphan`; short captions, `RESULTS`, and `ATTR_*` are unsupported.

### R8. Blocks and comments

Opening and closing markers may be indented within the current container; they must have the same indentation columns, and closing lines allow only trailing horizontal whitespace.

| Type | Opening | Closing | Content |
| --- | --- | --- | --- |
| Source | `#+BEGIN_SRC` or `#+BEGIN_SRC language` | `#+END_SRC` | Literal code; never executed |
| Example | `#+BEGIN_EXAMPLE` | `#+END_EXAMPLE` | Literal text |
| Quote | `#+BEGIN_QUOTE` | `#+END_QUOTE` | Paragraphs, lists, tables, rules, supported blocks, formulas, and inline syntax; no headings, drawers, TITLE, or footnote definitions |
| Comment | `#+BEGIN_COMMENT` | `#+END_COMMENT` | Literal comment, excluded from body output |

- A source language is optional; if present it starts with an ASCII letter or digit and continues with ASCII letters, digits, `_`, `-`, `+`, or `.`. Its case is retained; unknown languages are valid. Switches, extra parameters, execution headers, trailing comments, and arguments on EXAMPLE/QUOTE/COMMENT openers or closing lines are unsupported; see E2.
- Closed SRC, EXAMPLE, and COMMENT blocks are literal and do not nest: the first same-type, same-indent, unescaped closing line ends the block. Blank lines and heading-like lines are allowed inside.
- QUOTE can nest QUOTE; use matching indentation and a stack. Closed literal child blocks, standalone formulas, and environments are skipped as units. A column-zero heading encountered before a quote closes triggers E2.
- For SRC and EXAMPLE, first remove enclosing container indentation; then remove up to the opener's indentation from each nonblank content line, without deleting text characters. Do not dedent again by minimum content indentation or trim trailing spaces. Partial tabs follow R2.
- After dedenting, skip leading horizontal whitespace; if one or more commas immediately precede `*` or `#+`, remove only the first comma in the interpreted SRC/EXAMPLE content. Determine closing lines before comma removal: `,#+END_SRC` is content. Unescaped heading-like lines in a closed literal block are also content.
- QUOTE does not remove commas. COMMENT contents are fully retained and are not parsed. A comment line is optional indentation, `#`, at least one horizontal whitespace character, and optional text; `#` alone and `#tag` are ordinary text. `#+` is handled as a keyword first. Comments do not implicitly hide subtrees.

### R9. Named footnotes

- A reference is `[fn:label]` with exact lowercase `fn` and an R0 footnote label. A definition starts at physical column 0 with `[fn:label]`, at least one horizontal whitespace character, and optional body text. A standalone `[fn:n]` with no following whitespace is a reference, not an empty definition.
- Definitions are document-wide and may precede or follow references; labels, including numeric labels, need not be sequential. Multiple references may use one label.
- A definition extends through subsequent lines until the next column-zero definition, heading, two consecutive blank lines, or EOF. One blank line separates paragraphs; blank lines in closed literal regions do not terminate it.
- Bodies may contain paragraphs, lists, tables, rules, supported blocks, formulas, and inline syntax, but not headings, property drawers, TITLE, or nested footnote definitions. References do not recursively expand definitions.
- Missing definitions produce `unresolved`. Repeated definitions preserve all and use the first, with `duplicate` for later ones. Anonymous `[fn::content]` and inline-definition `[fn:name:content]` forms are unsupported whole candidates.

## Errors and unsupported content

### E1. General principles

1. Any decodable text can be parsed. Syntax errors do not fail the whole document, remove characters, invent closing markers, or silently convert to another Org form.
2. Excluded syntax has no special meaning but is not prohibited. Surrounding supported syntax can still apply: `* TODO Draft :work:` is a heading, and `- term :: description` is an ordinary list item.
3. When a recognized complete candidate falls back as a whole, do not search inside it for child syntax. For example, unsupported `[[mailto:a@example.com]]` is whole raw text; `<<<name>>>` cannot yield `<<name>>`.
4. Unknown keyword and unknown block delimiter lines are separate raw lines. An unknown block does not form a container; its interior is parsed in the current context. Use EXAMPLE for a fully literal region.
5. Bare `http://` and `https://` URLs, including angle-bracket forms, remain whole raw text without becoming links or emitting `unsupported`. Ordinary text does not globally disable other syntax; use a literal region when exact literal preservation is required.
6. Do not diagnose every ordinary text span. Diagnostics concern explicit candidates, invalid values, missing boundaries, or references, without modifying source or blocking subsequent structures.

### E2. Recovery boundaries

| Situation | Required recovery |
| --- | --- |
| Unpaired emphasis, inline code, script brackets, inline formula, or LaTeX arguments | Treat only the failed opener as text and continue within its allowed boundary. Short markers need not be diagnosed; an explicit unclosed `\(` gets `unclosed`. |
| Complete link shell with unsupported protocol, empty target/path, or invalid web host/ID | Preserve the whole candidate as raw text, without parsing its description. Unknown protocols get `unsupported`; other invalid values get `invalid-value`. File selector and percent-decoding errors retain the file link. |
| Unclosed `[[` or description | If no complete shell is found within the allowed boundary, treat `[[` as text, continue scanning, and emit `unclosed`; do not swallow later paragraphs or headings. |
| Anonymous/inline-definition footnote or radio target | With a same-line closer, preserve the whole candidate as raw and emit `unsupported`; otherwise treat the opener as text without searching across lines. |
| Valid block opener without a closer | Preserve the opener as a raw line; parse subsequent content normally in the outer context and emit `unclosed`. |
| Block opener with excluded parameters and a matching closer | Preserve the complete region as one raw region, do not parse its contents, and emit `unsupported`. Do not accept the block by ignoring its parameters. |
| Parameterized opener without a closer | Preserve only the opener as a raw line, parse later content normally, and emit both `unsupported` and `unclosed`. |
| QUOTE encounters a column-zero heading before closing | Fall back the opener to a raw line, parse the heading normally, and emit `unclosed`. |
| Property drawer without END | Search only up to the next column-zero heading or container end; if absent, fall back the opener, extract no properties, and emit `unclosed`. |
| Closed drawer containing an invalid property line | Preserve the entire drawer as a raw region, extract no properties, and emit `malformed`. |
| Unclosed standalone formula or LaTeX environment | Fall back the opener to a raw line, parse subsequent structures normally, and emit `unclosed`. |
| Orphan END, block closer, or LaTeX environment closer | Preserve a separate raw line and emit `orphan`; do not invent an opener. |
| Unattached NAME or CAPTION | Preserve a raw line and emit `orphan`; do not attach across a blank line. |
| Valid reference without a matching file, heading, ID, target, or footnote | Retain the reference node and target; mark it unresolved rather than converting it to text or creating a target. |

Search for a block closer stays inside its list item, footnote definition, or quote container. Closed literal regions are treated as units when finding container boundaries; insufficient list indentation remains a hard boundary. Recovery must always advance by at least one character or line. Once a missing closer is added, reparse the entire valid region.

### E3. Diagnostics and duplicate definitions

Each diagnostic has a code, source location, and explanation; presentation is up to the caller.

| Code | Meaning |
| --- | --- |
| `unsupported` | A complete candidate uses an unknown protocol, excluded footnote form, or unsupported block parameters |
| `malformed` | A closed candidate is structurally invalid, such as a drawer containing a non-property line |
| `unclosed` | An explicit candidate lacks a closing marker |
| `orphan` | A closing line, NAME, or CAPTION lacks an associated opener or object |
| `invalid-value` | An ID, selector, regular expression, encoding, or other value is invalid |
| `duplicate` | A repeated field or duplicate target in one namespace |
| `unresolved` | No target exists in a known, complete search scope |
| `ambiguous` | Multiple candidates match in the highest-priority applicable category |

Duplicate fields retain the first value; duplicate reference targets are ambiguous. Targets, NAME, headings, CUSTOM_ID, ID, and footnotes have separate namespaces. A not-yet-supplied external file or incomplete ID scope is pending, not confirmed missing.

### E4. Excluded syntax

| Input | Interpretation |
| --- | --- |
| Trailing `\\` | Literal backslashes, not a hard break |
| `+ item`, `1) item`, indented `* item` | Paragraph text, not list markers |
| `- term :: description`, `1. [@5] item` | Ordinary list items; `::` and `[@5]` are text |
| `* TODO [#A] item :tag:`, `* COMMENT draft` | Ordinary headings without task, priority, tag, or subtree-comment semantics |
| Timestamps, SCHEDULED, DEADLINE, CLOCK | Ordinary content without scheduling or time tracking |
| Bare or angle-bracket URLs | Text, not links |
| Bracket links using `mailto:`, `attachment:`, or other unknown protocols | Whole raw candidates with `unsupported` |
| TBLFM, PROPERTY, FILETAGS, OPTIONS, INCLUDE, SETUPFILE, MACRO, CALL, RESULTS, ATTR_* | Raw keyword lines, without execution, loading, substitution, attachment, or calculation |
| LOGBOOK and other ordinary drawers; VERSE, CENTER, EXPORT, and custom blocks | Raw delimiters; excluded containers are not created and their contents follow E1 |
| Single-line `: text` | Ordinary paragraph, not a literal region |
| Babel parameters, inline src/call, noweb | No code execution, extraction, insertion, or results; `<<helper>>` inside a closed source block is code text |

## Org compatibility

org-lite uses selected Org markers but follows this independently fixed syntax. It does not load Emacs, Org, or their configuration. Deliberate differences include Chinese-adjacent emphasis, list continuation at the content column, literal headings inside closed raw blocks, strict property-drawer placement, no implicit fuzzy local-link search, and explicit ambiguity diagnostics. NAME/CAPTION retain only basic forms; code switches, short captions, and export attributes are excluded. Source preservation and the explicit common subset do not guarantee identical Org rendering or every boundary case. The [conformance examples](examples.md) cover the specified behavior.

## Sources

The design refers to the [Org manual](https://orgmode.org/manual/) and [Org Syntax technical reference](https://orgmode.org/worg/org-syntax.html); the rules in this document define org-lite's own behavior.
