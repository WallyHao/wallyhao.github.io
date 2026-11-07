/**
 * Local plugin example: estimated reading time.
 *
 * This is what a Quartz v5 local plugin looks like:
 *   - referenced by relative path in quartz.config.yaml (source: ./plugins/reading-time)
 *   - symlinked into .quartz/plugins/ at build time and imported dynamically,
 *     no separate build step required
 *   - reads document content only, never writes into content/
 *
 * Transformer contract:
 *   { name, textTransform?, markdownPlugins?, htmlPlugins?, externalResources? }
 * This plugin uses htmlPlugins to prepend a paragraph to the HAST tree.
 */

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g

/** Recursively collect plain text from the HAST tree (skipping script/style noise) */
function collectText(node) {
  if (!node) return ""
  if (node.type === "text") return node.value ?? ""
  if (node.type === "element" && (node.tagName === "script" || node.tagName === "style")) {
    return ""
  }
  if (!Array.isArray(node.children)) return ""
  return node.children.map(collectText).join("")
}

function countReading(text, cjkPerMinute, wordsPerMinute) {
  const cjkChars = (text.match(CJK) ?? []).length
  const latinWords = text
    .replace(CJK, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length

  const minutes = cjkChars / cjkPerMinute + latinWords / wordsPerMinute
  return { cjkChars, latinWords, minutes, totalChars: cjkChars + latinWords }
}

/** @type {(opts?: { cjkPerMinute?: number, wordsPerMinute?: number, minChars?: number }) => any} */
export default function ReadingTime(opts = {}) {
  const cjkPerMinute = opts.cjkPerMinute ?? 300
  const wordsPerMinute = opts.wordsPerMinute ?? 200
  const minChars = opts.minChars ?? 300

  return {
    name: "ReadingTime",
    htmlPlugins() {
      return [
        () => (tree) => {
          const text = collectText(tree)
          const { minutes, totalChars } = countReading(text, cjkPerMinute, wordsPerMinute)

          // Skip short pages (home page, folder and tag listings)
          if (totalChars < minChars) return

          const label = `预计阅读 ${Math.max(1, Math.round(minutes))} 分钟`

          tree.children.unshift({
            type: "element",
            tagName: "p",
            properties: { className: ["reading-time"] },
            children: [{ type: "text", value: label }],
          })
        },
      ]
    },
  }
}
