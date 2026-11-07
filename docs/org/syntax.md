# org-lite Syntax Guide

This guide describes the syntax supported by org-lite v0.1. Documents are UTF-8 plain text. For exact whitespace, nesting, precedence, and recovery rules, see the [syntax reference](reference.md); see the [conformance examples](examples.md) for positive and negative cases.

## Document structure

A heading starts at the beginning of a line with one or more `*` followed by whitespace. The number of asterisks is its level:

```org
Text can also appear before the first heading.

* First-level heading
Body text.
** Second-level heading
More body text.
*** Third-level heading
```

Headings form a tree. A heading owns its body and descendants; its subtree range is retained so a caller can implement folding. Skipped levels are valid.

Consecutive ordinary lines form a paragraph; blank lines separate paragraphs. Ordinary newlines are soft breaks, and a trailing `\\` does not mean a hard break. A line containing at least five consecutive hyphens is a horizontal rule:

```org
-----
```

## Lists and checkboxes

Unordered items use `-`, and ordered items use digits followed by `.`. Whitespace must follow the marker. Indentation determines nested lists and continuation lines:

```org
- First item
  A continuation of the first item.
  - Nested item
- Second item

1. First step
2. Second step
```

Sibling markers align in the same column. Ordered numbers need not be consecutive and are retained as written. Continuation lines and nested lists must reach the content column after the current marker. Two consecutive blank lines end the lists in the current context. `+`, an indented `*`, and `1)` are not list markers.

A list item may begin with one of three checkboxes:

```org
- [ ] Not started
- [X] Complete
- [-] Partially complete
  - [X] Completed subitem
```

A checkbox must be followed by whitespace or the end of the line. Its state is recorded as written and is not recalculated from child items. Lowercase `[x]` is ordinary text.

## Inline formatting

```org
*bold*  /italic/  _underline_  +strike-through+
~inline code~  =verbatim text=
```

Markers must be paired and their contents cannot start or end with whitespace. Chinese characters may directly adjoin markers, as in `这是*重点*文字`; the asterisks in `a*bold*b` do not create bold text.

Bold, italic, underline, and strike-through may nest according to the reference rules. `~code~` and `=verbatim=` are distinct types; neither parses markup inside. There is no general backslash escape: use the other verbatim marker or an example block to preserve markup literally.

## Scripts and special symbols

`^` introduces a superscript and `_` a subscript. Bare, brace, and parenthesis forms are supported:

```org
x^2  x^-2  x^{10}  y_(i+1)  x_{i}^{2}
H_{2}O
```

A bare suffix consumes the longest legal sequence: in `H_2O`, the subscript is `2O`. Write `H_{2}O` to make only `2` the subscript. A complete underline takes precedence over a subscript.

Named entities represent special symbols:

```org
\alpha  \to  \pi{}r
```

Entity names are case-sensitive; `{}` separates a name from following text. Names come from the [Org Syntax v2 entity table](https://orgmode.org/worg/org-syntax.html); the project keeps an [entity data snapshot](../src/data/entities.ts). Unicode characters can also be entered directly.

## LaTeX mathematics

Inline and display formulas, commands with arguments, and environments are supported:

```org
Inline: \(x^2\) or $y_1$.

\[
x^2 + y^2 = z^2
\]

\begin{equation}
a = b + c
\end{equation}

\frac{1}{2}
```

`$$...$$` is also supported for display formulas. Formula and environment contents are retained as LaTeX source, without parsing org-lite inline markup. `$...$` must have content immediately inside both dollar signs and has additional closing-boundary rules; `\(...\)` offers explicit inline delimiters.

## Links and images

Links use double brackets and may have a description:

```org
[[https://example.com]]
[[https://example.com][Website]]
[[file:notes.org][Local file]]
```

`http:`, `https:`, `file:`, `id:`, and document-local targets are supported. In targets and descriptions, `\[`, `\]`, and `\\` escape brackets and backslashes. Bare URLs, `mailto:`, and `attachment:` do not create those link types; use `file:` for an attachment file.

File links can specify a location:

```org
[[file:notes.org::25]]
[[file:notes.org::*Plan]]
[[file:notes.org::#plan]]
[[file:notes.org::search text]]
[[file:notes.org::/a|ab/]]
```

These select a line, heading, `CUSTOM_ID`, name or text, and regular-expression match respectively. Regular expressions use the [fixed subset](reference.md#file-search-regular-expression-subset), selecting the earliest start and longest match at that start.

Headings, IDs, and explicit targets can be referenced:

```org
* Plan
:PROPERTIES:
:CUSTOM_ID: plan
:ID: project-001
:END:

More information: <<details>>.

[[*Plan]]  [[#plan]]  [[id:project-001]]  [[details]]
```

A local name looks for explicit targets, `NAME`, then headings; it does not implicitly search the full text. Cross-document `id:` links require caller-supplied documents. An unsupplied external file is pending; it is missing only when the caller confirms its absence.

Images use file links such as `[[file:images/diagram.png]]`. A link without a description or file selector, with a recognized image extension, is marked as an image candidate. Parsing does not read or preview the file.

## Tables

Use `|` to separate cells. Consecutive table lines form a table; separator rows divide it:

```org
| Item  | Quantity |
|-------+----------|
| Apple |        3 |
| Pear  |        2 |
```

A whole cell containing `<l>`, `<c>`, or `<r>` declares alignment; `<10>` declares width. They can be combined as `<r10>`:

```org
| <l>   | <r10> |
| Apple |     3 |
```

Rows may have different numbers of cells; missing cells are interpreted as empty without changing the source. A literal `|` always splits cells; use `\vert` to represent a pipe inside a cell. `#+TBLFM:` does not calculate table formulas.

## Metadata and properties

`#+TITLE:` sets the document title only at the outermost level before the first heading:

```org
#+TITLE: My notes
```

A property drawer can immediately follow a heading, with one property per line:

```org
* Project
:PROPERTIES:
:ID: project-001
:CUSTOM_ID: project
:OWNER: Alice
:END:
```

There must be no blank line between the heading and drawer. Property keys are ASCII case-insensitive; values are static single-line text. `ID` and `CUSTOM_ID` support link resolution. Other keys store data only: they do not inherit to child headings or activate Org workflows.

## Names and captions

`#+NAME:` names the immediately following content; `#+CAPTION:` supplies a caption:

```org
#+NAME: fruit-table
#+CAPTION: Fruit quantities
| Fruit | Quantity |
| Apple | 3        |

See [[fruit-table]].
```

The keywords can appear consecutively in either order, with no blank or unrelated line between them and the content. They can attach to paragraphs, lists, tables, supported content blocks, and standalone formulas. Repeated declarations remain in the source and produce a diagnostic; the first value takes effect.

## Content blocks

Source, literal example, and quote blocks are supported. Opening and closing markers occupy their own lines; keywords are ASCII case-insensitive:

```org
#+BEGIN_SRC python
print("hello")
#+END_SRC

#+BEGIN_EXAMPLE
*Markup* is literal here.
#+END_EXAMPLE

#+BEGIN_QUOTE
A quote with *formatting*.
#+END_QUOTE
```

The source language is optional. Source blocks preserve content without executing or extracting code. Example blocks do not parse formatting; quote blocks can contain paragraphs, lists, tables, and permitted inline formatting.

Source and example blocks support leading comma escapes: `,* Heading` has the content value `* Heading`, and `,#+END_SRC` is content rather than a closing marker. See the [reference](reference.md#r8-blocks-and-comments) for indentation and unclosed-block recovery.

## Footnotes and comments

Named footnotes use references and separate definitions:

```org
A statement with a note.[fn:note]

[fn:note] The footnote content.
```

A footnote can be referenced multiple times and defined before or after its references. Missing or repeated definitions are preserved and diagnosed. Anonymous and inline-definition variants are not supported.

A comment can be a line or block:

```org
# A comment line.

#+BEGIN_COMMENT
A multi-line comment.
#+END_COMMENT
```

Other markup inside comments is not parsed. A lone `#`, `#tag`, or `COMMENT` in a heading is not one of these comment forms.

## Unsupported content and recovery

The following Org constructs have no original special meaning in org-lite: heading TODO states and tags, dates and scheduling, clocking, progress statistics, description lists, table formulas, attachment management, general drawers, Babel execution, dynamic blocks, macros, and file inclusion. Unsupported text remains in the source.

Unclosed or invalid syntax follows the [recovery rules](reference.md#errors-and-unsupported-content), with diagnostics where applicable. Results retain source text, line endings, and positions; reference analysis distinguishes resolved, pending, missing, ambiguous, and invalid states. The parser does not implicitly read external files or execute document code.
