#!/usr/bin/env node
/**
 * org-lite -> Markdown converter.
 *
 * Turns the .org documents under org/ into .md files under content/ so the
 * regular Quartz build can consume them. The site itself only knows Markdown,
 * so no Quartz core code has to change.
 *
 *   node scripts/org-to-md.mjs                 # org/ -> content/
 *   node scripts/org-to-md.mjs --src org --out content
 *   node scripts/org-to-md.mjs --check         # report only, write nothing
 *
 * Leading `#+KEY:` lines are document metadata and become YAML frontmatter:
 *   #+TITLE:        -> title
 *   #+DATE:         -> date
 *   #+DESCRIPTION:  -> description
 *   #+TAGS:         -> tags (space or comma separated)
 *   #+DRAFT:        -> draft
 *   #+UNLISTED:     -> unlisted
 *   #+ALIASES:      -> aliases
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { stringify as stringifyYaml } from "yaml"
import { toMarkdown } from "mdast-util-to-markdown"
import GithubSlugger from "github-slugger"
import { parse, positionAt } from "../vendor/org-lite/dist/index.js"
import { entities } from "../vendor/org-lite/dist/data/entities.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const META_KEYS = new Set(["TITLE", "DATE", "DESCRIPTION", "TAGS", "DRAFT", "UNLISTED", "ALIASES"])

const BOOL_TRUE = new Set(["true", "yes", "1"])
const BOOL_FALSE = new Set(["false", "no", "0"])

const text = (mapped) => (typeof mapped === "string" ? mapped : (mapped?.text ?? ""))

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Emit raw Markdown (no escaping) for GFM footnotes, strikethrough and tables */
const raw = (value) => ({ type: "html", value })

const stripTrailingNewline = (s) => s.replace(/\n+$/, "")

/** org-lite spans are UTF-8 byte offsets, so slice the buffer rather than the string */
function sliceSource(source, span) {
  return Buffer.from(source, "utf8").subarray(span.start, span.end).toString("utf8")
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function extractMeta(source) {
  const lines = source.split("\n")
  const meta = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === "") {
      i += 1
      continue
    }
    const m = /^#\+([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(line)
    if (!m || !META_KEYS.has(m[1].toUpperCase())) break
    meta[m[1].toUpperCase()] = m[2].trim()
    i += 1
  }
  return { meta, body: lines.slice(i).join("\n"), lineOffset: i }
}

function toBool(value) {
  if (value === undefined) return undefined
  const v = value.trim().toLowerCase()
  if (BOOL_TRUE.has(v)) return true
  if (BOOL_FALSE.has(v)) return false
  return undefined
}

function buildFrontmatter(meta, relPath, warnings) {
  const data = {}
  if (meta.TITLE) data.title = meta.TITLE
  if (meta.DATE) data.date = meta.DATE
  if (meta.DESCRIPTION) data.description = meta.DESCRIPTION
  if (meta.TAGS) {
    data.tags = meta.TAGS.split(/[,\s]+/).filter(Boolean)
  }
  const draft = toBool(meta.DRAFT)
  if (draft !== undefined) data.draft = draft
  const unlisted = toBool(meta.UNLISTED)
  if (unlisted !== undefined) data.unlisted = unlisted
  if (meta.ALIASES) {
    data.aliases = meta.ALIASES.split(/[,\s]+/).filter(Boolean)
  }
  if (!data.title) {
    warnings.push("no #+TITLE:, falling back to the file name")
  }
  if (!data.date) {
    warnings.push("no #+DATE:, the date falls back to the file mtime")
  }
  return data
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

function headingSlugger() {
  return new GithubSlugger()
}

function linkUrl(target, ctx) {
  switch (target.kind) {
    case "web":
      return text(target.address)
    case "file": {
      let p = text(target.path).replace(/^file:/, "")
      let anchor = ""
      const sel = target.selector
      if (sel) {
        if (sel.kind === "heading") {
          anchor = "#" + ctx.slugForDoc(slugFromPath(p), text(sel.value))
        } else if (sel.kind === "custom_id") anchor = "#" + text(sel.value)
        else if (sel.kind === "local_name") anchor = "#" + text(sel.value)
        // Line, regexp and text selectors have no equivalent on a static site
      }
      p = p.replace(/\.(org|md)$/i, "").replace(/^\.\//, "")
      if (!p.startsWith("/")) p = "/" + p
      return p + anchor
    }
    case "id": {
      // Cross-document ID: resolve through the index built in the first pass
      const hit = ctx.ids.get(text(target.value))
      return hit ? `${hit.path}${hit.anchor ? "#" + hit.anchor : ""}` : "#" + text(target.value)
    }
    case "custom_id":
    case "local_name":
      return "#" + text(target.value)
    case "heading":
      return "#" + ctx.slugFor(text(target.value))
    default:
      return "#"
  }
}

function linkLabel(target, url) {
  switch (target.kind) {
    case "custom_id":
    case "local_name":
    case "heading":
    case "id":
      return text(target.value) || url
    case "file": {
      const name = text(target.path)
        .replace(/^file:/, "")
        .replace(/\.(org|md)$/i, "")
      return name || url
    }
    default:
      return url
  }
}

function convertLink(node, ctx) {
  const url = linkUrl(node.target, ctx)
  const desc = node.description

  if (node.imageCandidate && (!desc || desc.length === 0)) {
    return [{ type: "image", url, alt: "", title: null }]
  }
  if (!desc || desc.length === 0) {
    return [
      {
        type: "link",
        url,
        title: null,
        children: [{ type: "text", value: linkLabel(node.target, url) }],
      },
    ]
  }
  return [{ type: "link", url, title: null, children: convertInlines(desc, ctx) }]
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

function entityChar(name) {
  const ch = entities[name]
  return typeof ch === "string" ? ch : undefined
}

/** Inline nodes -> HTML string, for cases that can only be expressed as HTML (<sub>, <sup>, <u>) */
function inlinesToHtml(nodes, ctx) {
  return nodes.map((n) => inlineToHtml(n, ctx)).join("")
}

function inlineToHtml(node, ctx) {
  switch (node.kind) {
    case "text":
      return escapeHtml(text(node.value))
    case "soft_break":
      return " "
    case "emphasis": {
      const inner = inlinesToHtml(node.content, ctx)
      if (node.style === "bold") return `<strong>${inner}</strong>`
      if (node.style === "italic") return `<em>${inner}</em>`
      if (node.style === "underline") return `<u>${inner}</u>`
      return `<del>${inner}</del>`
    }
    case "inline_code":
    case "verbatim":
      return `<code>${escapeHtml(text(node.value))}</code>`
    case "entity":
      return escapeHtml(entityChar(node.name) ?? `\\${node.name}`)
    case "link": {
      const url = linkUrl(node.target, ctx)
      const label = node.description?.length
        ? inlinesToHtml(node.description, ctx)
        : escapeHtml(url)
      return `<a href="${escapeHtml(url)}">${label}</a>`
    }
    case "latex":
      return escapeHtml(text(node.value))
    case "scripted":
      return inlineToHtml(node.base, ctx) + node.parts.map((p) => scriptToHtml(p, ctx)).join("")
    case "script_part": {
      return scriptToHtml(node, ctx)
    }
    default:
      return ""
  }
}

function scriptToHtml(part, ctx) {
  const tag = part.position === "sub" ? "sub" : "sup"
  return `<${tag}>${inlinesToHtml(part.content, ctx)}</${tag}>`
}

function convertScripted(node, ctx) {
  const parts = [inlineToHtml(node.base, ctx), ...node.parts.map((p) => scriptToHtml(p, ctx))]
  return [raw(parts.join(""))]
}

function convertInlines(nodes, ctx) {
  const out = []
  for (const node of nodes) out.push(...convertInline(node, ctx))
  return out
}

function convertInline(node, ctx) {
  switch (node.kind) {
    case "text":
      return [{ type: "text", value: text(node.value) }]
    case "soft_break":
      return [{ type: "text", value: " " }]
    case "emphasis": {
      const children = convertInlines(node.content, ctx)
      if (node.style === "bold") return [{ type: "strong", children }]
      if (node.style === "italic") return [{ type: "emphasis", children }]
      if (node.style === "underline") {
        return [raw(`<u>${inlinesToHtml(node.content, ctx)}</u>`)]
      }
      // Strikethrough needs the GFM extension, so write the marker directly
      return [raw(`~~${inlinesToHtml(node.content, ctx)}~~`)]
    }
    case "inline_code":
    case "verbatim":
      return [{ type: "inlineCode", value: text(node.value) }]
    case "entity": {
      const ch = entityChar(node.name)
      return [{ type: "text", value: ch ?? `\\${node.name}` }]
    }
    case "link":
      return convertLink(node, ctx)
    case "footnote_reference":
      return [raw(`[^${node.label}]`)]
    case "scripted":
      return convertScripted(node, ctx)
    case "script_part":
      return [raw(scriptToHtml(node, ctx))]
    case "latex": {
      if (node.placement === "inline") {
        return [raw(`$${stripTrailingNewline(text(node.value))}$`)]
      }
      return [raw(`$$${stripTrailingNewline(text(node.value))}$$`)]
    }
    case "target":
      return [raw(`<a id="${escapeHtml(text(node.name))}"></a>`)]
    case "raw_inline":
      // org-lite puts rejected candidates (mailto: links, unclosed markup) into
      // raw_inline; this is the source fallback region and must be emitted verbatim,
      // otherwise the text disappears silently.
      return [{ type: "text", value: sliceSource(ctx.source, node.span) }]
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function inlineToMarkdown(nodes, ctx) {
  return toMarkdown({
    type: "root",
    children: [{ type: "paragraph", children: convertInlines(nodes, ctx) }],
  }).trim()
}

function tableBlock(node, ctx) {
  const rows = node.rows.filter((r) => r.kind === "table_row" && r.role === "data")
  if (rows.length === 0) return []

  const cellText = (cell) =>
    inlineToMarkdown(cell.content, ctx).replace(/\|/g, "\\|").replace(/\n+/g, " ")

  const body = rows.map((r) => r.cells.map(cellText))
  const width = Math.max(...body.map((r) => r.length))
  const pad = (row) => [...row, ...Array(width - row.length).fill("")]

  const formatRow = node.rows.find((r) => r.kind === "table_row" && r.role === "format")
  const alignSource = formatRow?.cells ?? rows[0].cells
  const alignCells = alignSource.map((cell) => {
    const alignment = cell.format?.alignment ?? null
    if (alignment === "left") return ":--"
    if (alignment === "center") return ":-:"
    if (alignment === "right") return "--:"
    return "---"
  })

  const lines = [`| ${pad(body[0]).join(" | ")} |`, `| ${alignCells.join(" | ")} |`]
  for (const row of body.slice(1)) lines.push(`| ${pad(row).join(" | ")} |`)
  return [raw(lines.join("\n"))]
}

function convertListItem(item, ctx) {
  const children = convertBlocks(item.body, ctx)
  if (children.length === 0) children.push({ type: "paragraph", children: [] })

  // Without the GFM extension mdast-util-to-markdown ignores `checked`,
  // so write the marker into the paragraph and let remark-gfm parse it back.
  if (item.checkbox) {
    const marker = item.checkbox.state === "checked" ? "[x] " : "[ ] "
    const first = children[0]
    if (first.type === "paragraph") first.children.unshift(raw(marker))
    else children.unshift({ type: "paragraph", children: [raw(marker)] })
  }

  if (item.checkbox?.state === "partial") {
    // GFM only has checked/unchecked, so keep the partial state as a comment
    const first = children[0]
    if (first.type === "paragraph") first.children.push(raw(" <!-- partial -->"))
    else children.unshift({ type: "paragraph", children: [raw("<!-- partial -->")] })
  }

  return { type: "listItem", spread: false, children }
}

function convertList(node, ctx) {
  const children = node.items.map((item) => convertListItem(item, ctx))
  const spread = children.some(
    (item) => item.children.filter((c) => c.type === "paragraph").length > 1,
  )
  const ordered = node.style === "ordered"
  const start = ordered ? Number(node.items[0]?.ordinal ?? 1) || 1 : null
  return { type: "list", ordered, start, spread, children }
}

function footnoteDefinition(node, ctx) {
  // org-lite keeps duplicate definitions and reports them; Markdown forbids them, keep the first
  if (ctx.footnotes.has(node.label)) return []
  ctx.footnotes.add(node.label)
  const inner = toMarkdown({
    type: "root",
    children: convertBlocks(node.body, ctx),
  }).trimEnd()
  const lines = inner.split("\n")
  const body = lines.map((line, i) => (i === 0 ? line : line ? `    ${line}` : line)).join("\n")
  return [raw(`[^${node.label}]: ${body}`)]
}

/** #+NAME: / #+CAPTION: attach to a block and become an anchor and a caption paragraph */
function applyAffiliations(node, out, ctx) {
  const affiliations = node.affiliations
  if (!affiliations?.length) return out

  const prefix = []
  const suffix = []
  for (const affiliation of affiliations) {
    if (affiliation.kind === "name") {
      const name = text(affiliation.value)
      if (name) prefix.push(raw(`<a id="${escapeHtml(name)}"></a>`))
    } else if (affiliation.kind === "caption") {
      const caption = convertInlines(affiliation.value, ctx)
      if (caption.length) {
        suffix.push({ type: "paragraph", children: [{ type: "emphasis", children: caption }] })
      }
    }
  }
  return [...prefix, ...out, ...suffix]
}

function convertBlock(node, ctx) {
  return applyAffiliations(node, convertBlockBody(node, ctx), ctx)
}

function convertBlockBody(node, ctx) {
  switch (node.kind) {
    case "paragraph":
      return [{ type: "paragraph", children: convertInlines(node.content, ctx) }]
    case "list":
      return [convertList(node, ctx)]
    case "table":
      return tableBlock(node, ctx)
    case "code_block":
      return [
        {
          type: "code",
          lang: node.language || null,
          value: stripTrailingNewline(text(node.value)),
        },
      ]
    case "example_block":
      return [{ type: "code", lang: null, value: stripTrailingNewline(text(node.value)) }]
    case "quote_block":
      return [{ type: "blockquote", children: convertBlocks(node.body, ctx) }]
    case "comment":
      return []
    case "horizontal_rule":
      return [{ type: "thematicBreak" }]
    case "footnote_definition":
      return footnoteDefinition(node, ctx)
    case "latex": {
      const body = text(node.value).replace(/^\n+/, "").replace(/\n+$/, "")
      if (node.placement === "inline") return [raw(`$${body}$`)]
      return [raw(`$$\n${body}\n$$`)]
    }
    case "raw_block":
      // Unknown #+ lines: org-lite treats them as plain text, keep them as such
      return [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: Buffer.from(ctx.source, "utf8")
                .subarray(node.span.start, node.span.end)
                .toString("utf8")
                .trim(),
            },
          ],
        },
      ]
    case "document_title":
    case "name":
    case "caption":
    case "property_drawer":
      return []
    default:
      return []
  }
}

function convertBlocks(nodes, ctx) {
  const out = []
  for (const node of nodes) out.push(...convertBlock(node, ctx))
  return out
}

function convertHeadings(headings, ctx) {
  const out = []
  for (const h of headings) {
    for (const entry of h.properties?.entries ?? []) {
      const key = entry.key.toUpperCase()
      if (key !== "ID" && key !== "CUSTOM_ID") continue
      const value = text(entry.value)
      if (value) out.push(raw(`<a id="${escapeHtml(value)}"></a>`))
    }
    out.push({
      type: "heading",
      depth: Math.min(Math.max(h.level, 1), 6),
      children: convertInlines(h.title, ctx),
    })
    out.push(...convertBlocks(h.body, ctx))
    out.push(...convertHeadings(h.headings, ctx))
  }
  return out
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** First pass: collect :ID: / :CUSTOM_ID: for cross-document id: links */
function collectIds(document, pagePath) {
  const found = []
  const visit = (headings) => {
    for (const h of headings) {
      for (const entry of h.properties?.entries ?? []) {
        const key = entry.key.toUpperCase()
        if (key !== "ID" && key !== "CUSTOM_ID") continue
        const value = text(entry.value)
        if (!value) continue
        found.push({ id: value, path: pagePath, anchor: value })
      }
      visit(h.headings)
    }
  }
  visit(document.headings)
  return found
}

function collectHeadingSlugs(document) {
  const slugger = headingSlugger()
  const map = new Map()
  const slugOf = (nodes) => inlineToMarkdownPlain(nodes)
  const visit = (headings) => {
    for (const h of headings) {
      const title = slugOf(h.title)
      const slug = slugger.slug(title)
      if (!map.has(title)) map.set(title, slug)
      visit(h.headings)
    }
  }
  visit(document.headings)
  return map
}

/** Plain text of a heading, without mdast serialization so escaping cannot affect the slug */
function inlineToMarkdownPlain(nodes) {
  return nodes
    .map((n) => {
      if (n.kind === "text") return text(n.value)
      if (n.kind === "entity") return entityChar(n.name) ?? ""
      if (n.kind === "inline_code" || n.kind === "verbatim") return text(n.value)
      if (n.kind === "emphasis") return inlineToMarkdownPlain(n.content)
      if (n.kind === "link")
        return n.description?.length ? inlineToMarkdownPlain(n.description) : ""
      if (n.kind === "scripted") return inlineToMarkdownPlain([n.base])
      return ""
    })
    .join("")
}

function slugFromPath(relPath) {
  return "/" + relPath.replace(/\.org$/i, "").replace(/(^|\/)index$/i, "$1")
}

function convertFile(source, relPath, ids, slugMaps) {
  const warnings = []
  const { meta, body, lineOffset } = extractMeta(source)

  const parsed = parse({ id: relPath, text: body, origin: relPath })
  if (!parsed.ok) {
    throw new Error(`parse failed: ${JSON.stringify(parsed.error)}`)
  }
  const document = parsed.value.document

  // org-lite diagnostics: unsupported / unclosed / orphan mean the construct was
  // not recognized and will be treated as plain text or dropped. Warn the author.
  const snapshot = { id: relPath, text: body, origin: relPath }
  for (const diagnostic of parsed.value.diagnostics ?? []) {
    if (diagnostic.code === "duplicate") continue
    const position = positionAt(snapshot, diagnostic.location.span.start)
    const where = position.ok ? `:${position.value.line + 1 + lineOffset}` : ""
    warnings.push(`${diagnostic.code}${where} ${diagnostic.message}`)
  }
  const pagePath = slugFromPath(relPath)

  const slugMap = collectHeadingSlugs(document)
  const ctx = {
    source: body,
    ids,
    footnotes: new Set(),
    slugFor: (headingText) => slugMap.get(headingText) ?? slugText(headingText),
    // Cross-document links use the target document's own slug table
    slugForDoc: (pagePath, headingText) =>
      slugMaps.get(pagePath)?.get(headingText) ?? slugText(headingText),
  }

  const children = [
    ...convertBlocks(document.preamble, ctx),
    ...convertHeadings(document.headings, ctx),
  ]

  const markdown = toMarkdown({ type: "root", children }, { bullet: "-", fences: true, rule: "-" })
  const frontmatter = buildFrontmatter(meta, relPath, warnings)
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 })
  const output = `---\n${yaml}---\n\n${markdown}`

  return { output, warnings, pagePath, ids: collectIds(document, pagePath) }
}

function slugText(value) {
  return new GithubSlugger().slug(value)
}

// ---------------------------------------------------------------------------
// File walking and CLI
// ---------------------------------------------------------------------------

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue
      out.push(...walk(full))
    } else if (entry.name.toLowerCase().endsWith(".org")) {
      out.push(full)
    }
  }
  return out
}

/** Walk every file (including non-.org ones) to sync static assets */
function walkAll(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkAll(full))
    else out.push(full)
  }
  return out
}

function parseArgs(argv) {
  const opts = { src: "org", out: "content", check: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--src") opts.src = argv[++i]
    else if (arg === "--out") opts.out = argv[++i]
    else if (arg === "--check") opts.check = true
    else if (arg === "--help" || arg === "-h") {
      console.log("usage: node scripts/org-to-md.mjs [--src org] [--out content] [--check]")
      process.exit(0)
    }
  }
  return opts
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const srcDir = path.resolve(opts.src)
  const outDir = path.resolve(opts.out)

  if (!fs.existsSync(srcDir)) {
    console.error(`source directory not found: ${opts.src}`)
    process.exit(1)
  }

  const files = walk(srcDir).sort()
  const rels = files.map((fp) => path.relative(srcDir, fp))

  // First pass: collect IDs so cross-document id: links can resolve
  const ids = new Map()
  const parsedDocs = rels.map((rel) => {
    const source = fs.readFileSync(path.join(srcDir, rel), "utf8")
    const { body } = extractMeta(source)
    const parsed = parse({ id: rel, text: body, origin: rel })
    return { rel, source, parsed }
  })
  const slugMaps = new Map()
  for (const { rel, parsed } of parsedDocs) {
    if (!parsed.ok) continue
    const pagePath = slugFromPath(rel)
    slugMaps.set(pagePath, collectHeadingSlugs(parsed.value.document))
    for (const entry of collectIds(parsed.value.document, pagePath)) {
      if (!ids.has(entry.id)) ids.set(entry.id, { path: entry.path, anchor: entry.anchor })
    }
  }

  const manifestPath = path.join(outDir, ".org-to-md.json")
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : {}
  const previous = manifest.generated ?? []
  const previousAssets = manifest.assets ?? []

  const generated = []
  const copiedAssets = []
  let failed = 0
  let warned = 0

  for (const { rel, source, parsed } of parsedDocs) {
    const targetRel = rel.replace(/\.org$/i, ".md")
    try {
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.error))
      const result = convertFile(source, rel, ids, slugMaps)
      for (const warning of result.warnings) {
        warned += 1
        console.warn(`  ! ${rel}: ${warning}`)
      }
      if (!opts.check) {
        const target = path.join(outDir, targetRel)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, result.output)
      }
      generated.push(targetRel)
      console.log(`  ${rel} → ${path.join(opts.out, targetRel)}`)
    } catch (err) {
      failed += 1
      console.error(`  ✗ ${rel}: ${err.message}`)
    }
  }

  // Sync static assets (images and so on) from org/ to content/ so links work
  const assetFiles = walkAll(srcDir).filter((fp) => !fp.toLowerCase().endsWith(".org"))
  for (const fp of assetFiles) {
    const rel = path.relative(srcDir, fp)
    if (opts.check) continue
    const target = path.join(outDir, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(fp, target)
    copiedAssets.push(rel)
  }

  if (!opts.check) {
    for (const stale of [...previous, ...previousAssets]) {
      const keep = generated.includes(stale) || copiedAssets.includes(stale)
      if (!keep) {
        const target = path.join(outDir, stale)
        if (fs.existsSync(target)) fs.unlinkSync(target)
        console.log(`  - removed stale output ${path.join(opts.out, stale)}`)
      }
    }
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ generated, assets: copiedAssets }, null, 2) + "\n",
    )
  }

  console.log(
    `\n${generated.length} converted${warned ? `, ${warned} warning(s)` : ""}${failed ? `, ${failed} failed` : ""}`,
  )
  if (failed > 0) process.exit(1)
}

main()
