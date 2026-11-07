# org-lite v0.1 Conformance Examples

These examples complement the [syntax guide](syntax.md) and specify inputs and expected interpretations. Each case is independent; only explicitly supplied files are in scope for reference resolution. Fenced examples are input. A construct that does not produce a syntax node is still preserved in the source.

All 52 cases are checked by the current implementation. See the [README](../README.md) for usage. Some inputs intentionally retain Chinese text to exercise Unicode and byte offsets; escaped strings specify otherwise invisible bytes, tabs, and trailing spaces.

## Document Structure and Lists

### S01. Heading tree and paragraphs

```org
开篇第一行
开篇第二行

另一段。
* 项目
正文。
*** 跳级子标题
内容。
* TODO [#A] 下一项 :work:
```

Expected: The first two lines form one paragraph, followed by another. The two level-one headings are siblings; the level-three heading belongs to the project without an invented level-two heading. The final heading text includes `TODO`, priority, and tag markers with no special task semantics.

### S02. Headings and excluded asterisk lists

```org
* 标题
  * 不是列表
*没有空格
```

Expected: Only the first line is a heading; the remaining lines are ordinary paragraphs in its body, not lists or headings.

### S03. Horizontal rules and hard line breaks

```org
第一行\\
第二行

-----
----
----- text
```

Expected: The first two lines form one paragraph; both backslashes remain and no hard-break node is created. Only `-----` is a rule; the final two lines form a paragraph.

### S04. List marker scope

```org
- 苹果
- 名词 :: 说明
1. [@5] 步骤
2. 下一步
+ 不是列表
1) 也不是列表
```

Expected: Two unordered items are followed by two ordered items. `::` and `[@5]` are item text. The last two lines form a paragraph outside the lists.

### S05. Continuation lines, nested lists, and blocks

```org
- 主项
  这是续行。
  - 子项
    子项续行。
  #+BEGIN_SRC text
  hello
  #+END_SRC
- 第二项
```

Expected: The parent item has content column C=2 and contains a paragraph, nested list, and code block. The child has C=4. The code value is `hello` and its original newline, without list indentation. The second item is a sibling.

### S06. Ordinals, content columns, and insufficient indentation

```org
09. 第一步
    四列续行。
02. 第二步
  两列文字。
```

Expected: The ordered list preserves the original nonconsecutive ordinals `09` and `02`; both content columns are 4. The final line is insufficiently indented and forms a paragraph outside the list.

### S07. Blank lines terminate lists

```org
- 第一项

  项内第二段。

- 第二项


  列表外文字。
```

Expected: The first item contains two paragraphs; the second belongs to the same list. Two consecutive blank lines close the list, so the final indented line is outside it.

### S08. Three checkbox states

```org
- [ ] 未完成
- [X] 已完成
- [-] 部分完成
  - [X] 子项已完成
1. [ ] 有序项也可带框
```

Expected: All three states and the nested checkbox are recognized. The parent remains `[-]` even though its only child is checked. The last line starts an adjacent ordered list.

### S09. Invalid checkbox positions and characters

```org
- [x] 小写
- [ ]紧邻文字
- 前文 [ ] 后文
- [@5] [ ] 非正文开头
正文中的 [X]
```

Expected: No checkboxes are recognized. The first four lines remain ordinary list items; the last is outside the list.

## Inline Formatting and Mathematics

### S10. Six inline formats

```org
*粗体* /斜体/ _下划线_ +删除线+ ~code~ =verbatim=
```

Expected: Six distinct nodes are recognized in order; code and verbatim text have different semantic types.

### S11. Adjacent Chinese text and within-word markers

```org
这是*重点*文字，另有/斜体/。
a*bold*b 与 * bold* 与 *bold *。
```

Expected: The bold and italic on the first line are valid. The three asterisk candidates on the second line fail because of within-word boundaries, leading whitespace, and trailing whitespace respectively.

### S12. Nesting without crossing

```org
*粗体里有 /斜体/ 和 ~a*b~*。

*a /b* c/
```

Expected: The first paragraph is bold and contains italic and complete inline code; the code’s `*` does not close bold. In the second paragraph, italic cannot cross the bold boundary and the trailing text remains plain.

### S13. Verbatim content does not parse nested markup

```org
~*不是粗体* [[file:a.org]]~
=/不是斜体/ [fn:n]=
```

Expected: Only code and verbatim nodes are created; their contents contain no bold, italic, link, or footnote nodes. The newline remains inside the outer paragraph.

### S14. Recovery from unclosed inline markup

Recovery: E2.

```org
~没有结束

* 下一节
*未闭合文字

x^{未闭合

正常段落。
```

Expected: The first code candidate cannot close across a line; unclosed bold and scripts cannot cross a blank line. The next heading and final paragraph are recognized and all source is retained.

### S15. Forms of subscripts and superscripts

```org
x^2 H_2O H_{2}O x^-2 x^{y^{z}} y_(i+1) x^* x_{i}^{2}
(_text_)
```

Expected: The examples recognize superscript `2`, subscript `2O`, subscript `2`, superscript `-2`, nested superscript, parenthesized subscript, star superscript, and subscript `i` plus superscript `2` sharing `x`. The last line is underlined text, not a subscript.

### S16. Entity termination

```org
\alpha \to \pi{}r \alphaBeta \notAnOrgEntity
```

Expected: The first three entities represent alpha, an arrow, and pi; `r` is text. The final two unknown full names remain text and are not split at known prefixes or treated as argument-free LaTeX commands.

### S17. Supported LaTeX forms

```org
行内 \(x^2\) 与 $y_1$，也有 $$z^2$$。
\[
a + b
\]
\frac{1}{2}
```

Expected: Two inline formulas, a double-dollar display formula in a paragraph, a standalone display formula, and a literal LaTeX command with two arguments are recognized. Scripts within formulas are not Org scripts.

### S18. Single-dollar boundaries

```org
$x$，中文标点允许。
$ 5 $
$x$-axis
```

Expected: Only the first line contains a formula. The second fails because of edge whitespace and the third because `-` immediately follows the closing dollar sign.

### S19. Nested LaTeX environments

```org
\begin{equation}
\begin{aligned}
x &= 1
\end{aligned}
\end{equation}
```

Expected: One literal LaTeX environment is recognized with nested environments matched by name; its contents are not parsed as Org and no typesetting installation is required.

### S20. Unclosed formulas and environments

Recovery: E2.

```org
\[
公式草稿
* 仍是标题
\begin{equation}
x = 1
* 下一节
```

Expected: Both the display formula and environment are unclosed: their opening lines fall back to raw text with `unclosed` diagnostics. Both headings remain visible.

## Links, Locations, and Images

### S21. Web links and descriptions

```org
[[https://example.com]]
[[http://example.com/docs][查看 *说明*]]
```

Expected: Two web links are recognized; the second description contains bold text. Parsing does not access the network.

### S22. Escaped link brackets

```org
[[file:notes\[old\].org][旧版]]
```

Expected: The file target is `notes[old].org` and its description means “old version”. Escaped brackets do not terminate the link. An unsupplied file remains pending.

### S23. Locations inside files

Supply a target file `notes.org` with exactly these six lines:

```org
* 计划
:PROPERTIES:
:CUSTOM_ID: plan
:END:
<<spot>>
needle text
```

Current document:

```org
[[file:notes.org::6]]
[[file:notes.org::*计划]]
[[file:notes.org::#plan]]
[[file:notes.org::spot]]
[[file:notes.org::needle text]]
[[file:notes.org::/needle.*/]]
[[file:notes.org::/(needle|other) text/]]
```

Expected: The links locate line six, a heading, a CUSTOM_ID, an explicit target, a substring on line six, and two regular-expression matches on that line. Groups and alternatives use the specified org-lite subset, independent of Emacs. Missing files and syntax errors are distinct.

### S24. Headings, explicit targets, and NAME

```org
[[*计划]] [[spot]] [[grid]]
* 计划
正文 <<spot>>。
#+NAME: grid
| a | b |
```

Expected: The three links resolve to the heading, body target, and named table respectively. Definitions may follow their references.

### S25. CUSTOM_ID and cross-document ID

Current document:

```org
[[#local]] [[id:remote-001]]
* 本节
:PROPERTIES:
:CUSTOM_ID: local
:END:
```

The caller also supplies `remote.org`:

```org
* 远端
:PROPERTIES:
:ID: remote-001
:END:
```

Expected: Both links resolve. Without the remote document and a complete ID scope, the second remains pending; disk scanning is not required.

### S26. Duplicate names and unresolved links

Diagnostics: `duplicate`, `ambiguous`, `unresolved`.

```org
[[*重名]] [[不存在]]
* 重名
* 重名
```

Expected: The duplicate headings produce `duplicate`; the first link is ambiguous rather than silently choosing the first heading. The second remains a valid link with `unresolved`.

### S27. Excluded links and radio targets

```org
https://example.com
<https://example.com>
[[mailto:a@example.com][*邮件*]]
[[attachment:a.pdf]]
<<<术语>>>
```

Expected: No link or target nodes are created. Unknown-protocol candidates remain whole raw text with `unsupported`; markup in their descriptions is not parsed. Triple angle brackets do not produce a double-angle target.

### S28. Unclosed links do not consume later content

Recovery: E2.

```org
[[https://example.com][缺少末尾

* 正常标题
[[https://example.com][完整]]
```

Expected: The first opener remains text and cannot search past a blank line or heading. The later heading and complete link are recognized.

### S29. Image candidates remain file links

```org
[[file:images/plot.PNG]]
[[file:images/plot.png][查看图片]]
[[file:report.pdf]]
```

Expected: All three are file links. Only the first is an image candidate: the second has a description and the third is an ordinary file. Preview and existence are not implied.

## Tables and Metadata

### S30. Tables, separators, and uneven columns

```org
| 名称 | 数量 |
|------+------|
| 苹果 | 3 |
| 梨
||
```

Expected: One two-column table contains a separator. Missing cells in the last rows are interpreted as empty without changing the source; the first row is not automatically a header.

### S31. Column formats, widths, and conflicts

```org
| <l> | <r10> |
| 苹果 | 3 |
| <c> | <0> |
```

Expected: The first row is a format row: column one is left-aligned and column two is right-aligned with width 10. The later `<c>` conflicts, emits `duplicate`, and does not replace the first alignment; `<0>` is ordinary cell text.

### S32. Table splitting precedes inline parsing

```org
| ~a|b~ | \vert |
```

Expected: There are three cells. The first two contain unclosed code-like text because inline code does not protect literal pipes. The third contains the `\vert` entity without introducing a new column.

### S33. TITLE position, case, and duplicates

```org
#+title: 第一份 *笔记*
#+TITLE: 第二个标题
* 章节
#+TITLE: 章节里的文字
```

Expected: The first value is the document title and contains bold. The second is retained with `duplicate` and does not overwrite it. TITLE in a section body is a raw line.

### S34. Properties hold static information

```org
* 项目
:properties:
:id: project-001
:OWNER: *Alice*
:DIR: attachments
:HEADER-ARGS: :tangle yes
:END:
** 子项
```

Expected: The property drawer and ID are recognized. OWNER retains literal asterisks, DIR does not enable attachments, and HEADER-ARGS does not enable code parameters. Children do not inherit properties.

### S35. Property drawer in an invalid position

```org
* 项目

:PROPERTIES:
:ID: ignored
:END:
```

Expected: The blank line prevents the drawer from immediately following the heading, so no properties are defined and `ignored` is not registered as an ID.

### S36. Malformed and unclosed drawers

Recovery: E2.

```org
* 非法抽屉
:PROPERTIES:
:ID: must-not-register
不是属性的一行
:END:
* 未闭合抽屉
:PROPERTIES:
:ID: also-not-register
* 后续标题
```

Expected: The first drawer is one raw region with `malformed`; the second opener falls back to text with `unclosed`. Neither ID is registered and the later heading is recognized.

### S37. Attached and orphaned NAME and CAPTION

```org
#+CAPTION: 一张 *小表*
#+NAME: table-one
| a | b |
#+CAPTION: 孤立的题注

普通段落。
```

Expected: The first two lines attach to the same table; the caption contains bold and the table name is linkable. The later CAPTION cannot cross a blank line and is an orphan raw line.

## Blocks, Comments, and Footnotes

### S38. Optional and unknown code languages

```org
#+begin_src
plain
#+end_src
#+BEGIN_SRC my-language
unknown()
#+END_SRC
```

Expected: Two valid code blocks are recognized, one without a language and one with an unknown language. Keywords are case-insensitive; no executor or highlighter is needed.

### S39. Literal content, indentation, and comma escapes

```org
#+BEGIN_EXAMPLE
* 原样标题
,#+END_EXAMPLE
,,* comma
#+END_EXAMPLE

  #+BEGIN_SRC text
    indented
  #+END_SRC
```

Expected: The example body contains a literal heading-style line, `#+END_EXAMPLE`, and `,* comma`; none becomes a heading or prematurely ends the block. The code body keeps two leading spaces before `indented`.

### S40. Nested quotes and literal child blocks

```org
#+BEGIN_QUOTE
引用里的 *强调*。
#+BEGIN_QUOTE
- 嵌套引用里的列表
#+END_QUOTE
#+BEGIN_SRC text
#+END_QUOTE
#+END_SRC
#+END_QUOTE
```

Expected: The outer quote contains a paragraph, nested quote, and code block. END_QUOTE inside the code is literal and does not close the outer quote.

### S41. Comment lines and closed comment blocks

```org
# 这一行是注释，*不加粗*
#tag
#+BEGIN_COMMENT
* 不建立标题
[[id:也不建立链接]]
#+END_COMMENT
* COMMENT 这是普通标题
```

Expected: The comment line and closed comment block are excluded from body output; `#tag` is an ordinary paragraph. The final heading remains a heading and COMMENT does not hide it.

### S42. Unclosed comments and code

Recovery: E2.

```org
#+BEGIN_COMMENT
草稿
* 可见标题
#+BEGIN_SRC python
print(1)
* 下一个标题
```

Expected: No valid comment or code block is created. Both openers fall back to text with `unclosed`; both later headings remain visible.

### S43. Excluded code parameters are not ignored

```org
#+BEGIN_SRC python :results output
* 代码里的星号
print(1)
#+END_SRC
* 真正的标题
```

Expected: The first four lines form one raw fallback region with `unsupported`, not a valid code block; the heading inside it is not parsed. Only the final line is a heading. The code is not executed.

### S44. List containers bound block searches

Recovery: E2.

```org
- 项目
  #+BEGIN_SRC text
  block draft
- 下一项
  #+END_SRC
```

Expected: The first block cannot search for its end across the next list item. Its opener falls back with `unclosed`; both items remain and END_SRC in the second item is an orphan raw line.

### S45. Named footnotes and multiple paragraphs

```org
引用[fn:note]，再次引用[fn:note]。

[fn:note] 第一段。

第二段，可含 *强调*。


回到文档正文。
```

Expected: Both references resolve to one two-paragraph definition. Two blank lines terminate the definition; the last line is document body. Footnote body indentation is not required.

### S46. Missing and duplicate footnotes

Diagnostics: `unresolved`, `duplicate`.

```org
引用[fn:missing]和[fn:n]。

[fn:n] 第一定义。
[fn:n] 第二定义。
```

Expected: The missing reference is retained with `unresolved`. The first definition of n takes effect; the second is preserved with `duplicate`.

### S47. Excluded footnote variants

```org
匿名[fn::不保留 *格式*]，行内命名[fn:n:也不保留]。
```

Expected: Both candidates remain whole raw text with `unsupported`; their internal asterisks are not parsed and no footnote references or definitions are created.

## Unsupported Content and Source Preservation

### S48. Unknown blocks do not form containers

```org
#+BEGIN_VERSE
- 这一行仍是列表
#+END_VERSE
#+BEGIN_warning
* 这一行仍是标题
#+END_warning
```

Expected: The four delimiter lines are raw lines; the list and heading inside use normal context rules. An unknown block name does not hide its contents.

### S49. Unknown and excluded keywords have no side effects

```org
#+INCLUDE: "secret.org"
#+CALL: calculate()
#+TBLFM: $2=$1+1
#+AUTHOR: Alice
#+WHAT: *原文*
```

Expected: All are separate raw lines: no file is read, call executed, formula evaluated, or AUTHOR metadata created. Asterisks in unknown keyword lines also remain literal.

### S50. Line endings, trailing spaces, tabs, and EOF

Input as an escaped string: `"- item\r\n\tcontinuation  \r\n"`. Here `\r\n` represents actual CRLF, `\t` an actual tab, and two actual spaces follow `continuation`.

Expected: One list item is formed. The tab reaches column 8 and qualifies as a continuation. CRLF, the tab, and both trailing spaces are preserved; removing C=2 indentation leaves six spaces in the interpreted continuation. LF and a missing final newline are also valid.

### S51. Duplicate property keys and invalid ID

Diagnostics: `duplicate`, `invalid-value`.

```org
* 项目
:PROPERTIES:
:ID: has space
:id: valid-second
:OWNER: Alice
:owner: Bob
:END:
```

Expected: The drawer is structurally valid. The first ID is invalid and emits `invalid-value`; the duplicate cannot override it and neither is registered. OWNER keeps Alice; Bob remains in the source with `duplicate`.

### S52. Whitespace and case are not silently relaxed

The input strings are `"*\u3000标题"`, `"- [x] 小写"`, and `"* 标题"`. `\u3000` denotes an actual full-width space.

Expected: The first input is not a heading; the second is a list item without a checkbox; the third is a heading. Full-width space is not replaced by ASCII space, and `[x]` is not changed to `[X]`.
