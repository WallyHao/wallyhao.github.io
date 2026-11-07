#!/usr/bin/env node
/**
 * org-lite → Markdown 转换器
 *
 * 把 org/ 下的 .org 文档转成 content/ 下的 .md，交给 Quartz 正常构建。
 * 站点本身仍然只认 Markdown，所以不需要改任何 Quartz 内核代码。
 *
 *   node scripts/org-to-md.mjs                 # org/ → content/
 *   node scripts/org-to-md.mjs --src org --out content
 *   node scripts/org-to-md.mjs --check         # 只报告，不写文件
 *
 * 约定：文件顶部的 #+KEY: 行是文档元数据，会转成 YAML frontmatter。
 *   #+TITLE:        → title
 *   #+DATE:         → date
 *   #+DESCRIPTION:  → description
 *   #+TAGS:         → tags（空格或逗号分隔）
 *   #+DRAFT:        → draft
 *   #+UNLISTED:     → unlisted
 *   #+ALIASES:      → aliases
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
// 小工具
// ---------------------------------------------------------------------------

const META_KEYS = new Set(["TITLE", "DATE", "DESCRIPTION", "TAGS", "DRAFT", "UNLISTED", "ALIASES"])

const BOOL_TRUE = new Set(["true", "yes", "1"])
const BOOL_FALSE = new Set(["false", "no", "0"])

const text = (mapped) => (typeof mapped === "string" ? mapped : (mapped?.text ?? ""))

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** 原样写入一段 Markdown（不转义、不加工），用于 GFM 脚注、删除线、表格等 */
const raw = (value) => ({ type: "html", value })

const stripTrailingNewline = (s) => s.replace(/\n+$/, "")

/** org-lite 的 span 是 UTF-8 字节偏移，必须按字节切片 */
function sliceSource(source, span) {
  return Buffer.from(source, "utf8").subarray(span.start, span.end).toString("utf8")
}

// ---------------------------------------------------------------------------
// 元数据
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
    warnings.push("缺少 #+TITLE:，用文件名作为标题")
  }
  if (!data.date) {
    warnings.push("缺少 #+DATE:，日期将回退到文件时间")
  }
  return data
}

// ---------------------------------------------------------------------------
// 链接
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
        // line / regexp / text 选择器在静态站点里没有对应物，丢弃
      }
      p = p.replace(/\.(org|md)$/i, "").replace(/^\.\//, "")
      if (!p.startsWith("/")) p = "/" + p
      return p + anchor
    }
    case "id": {
      // 跨文档 ID：用第一遍扫描出来的索引解析到具体页面
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
// 行内
// ---------------------------------------------------------------------------

function entityChar(name) {
  const ch = entities[name]
  return typeof ch === "string" ? ch : undefined
}

/** 行内节点 → HTML 字符串（用于 <sub>/<sup>/<u> 这类只能走 HTML 的场景） */
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
      // 删除线需要 GFM 扩展，这里直接写 ~~...~~
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
      // org-lite 把不成立的候选（如 mailto: 链接、未闭合标记）整段放进 raw_inline，
      // 这里是原文回退区，必须原样输出，否则内容会静默消失。
      return [{ type: "text", value: sliceSource(ctx.source, node.span) }]
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// 块级
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

  // mdast-util-to-markdown 没有 GFM 扩展时不认 checked 字段，
  // 直接把 `[ ]` / `[x]` 原样写进段落开头，交给 remark-gfm 解析。
  if (item.checkbox) {
    const marker = item.checkbox.state === "checked" ? "[x] " : "[ ] "
    const first = children[0]
    if (first.type === "paragraph") first.children.unshift(raw(marker))
    else children.unshift({ type: "paragraph", children: [raw(marker)] })
  }

  if (item.checkbox?.state === "partial") {
    // GFM 只有勾选/未勾选两态，用注释把「部分完成」保留在源码里
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
  // org-lite 会保留重复定义并记 duplicate；Markdown 里重复定义是非法的，只取首个
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

/** #+NAME: / #+CAPTION: 附着在块上，转换成锚点与题注段落 */
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
      // 未知 #+ 行：org-lite 只当作普通文本，这里保留下来
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
// 文档
// ---------------------------------------------------------------------------

/** 第一遍：收集 :ID: / :CUSTOM_ID:，供跨文档 id: 链接使用 */
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

/** 标题纯文本（不经过 mdast 序列化，避免转义影响 slug） */
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
    throw new Error(`解析失败：${JSON.stringify(parsed.error)}`)
  }
  const document = parsed.value.document

  // org-lite 的诊断：unsupported / unclosed / orphan 等意味着这段语法没被识别，
  // 会按普通文字处理或丢弃，值得提醒作者。
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
    // 跨文档链接：用目标文档自己的 slug 表（同名标题会被编号）
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
// 文件遍历与 CLI
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

/** 遍历所有文件（含非 .org），用于同步静态资源 */
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
      console.log("用法：node scripts/org-to-md.mjs [--src org] [--out content] [--check]")
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
    console.error(`找不到源目录：${opts.src}`)
    process.exit(1)
  }

  const files = walk(srcDir).sort()
  const rels = files.map((fp) => path.relative(srcDir, fp))

  // 第一遍：收集 ID，让跨文档 id: 链接能解析
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

  // org/ 里的图片等静态资源同步到 content/，让文件链接能正常访问
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
        console.log(`  - 删除过期产物 ${path.join(opts.out, stale)}`)
      }
    }
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ generated, assets: copiedAssets }, null, 2) + "\n",
    )
  }

  console.log(
    `\n${generated.length} 篇转换完成${warned ? `，${warned} 条提示` : ""}${failed ? `，${failed} 篇失败` : ""}`,
  )
  if (failed > 0) process.exit(1)
}

main()
