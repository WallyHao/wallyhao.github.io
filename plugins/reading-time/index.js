/**
 * 本地插件示例：预计阅读时间。
 *
 * 这是 Quartz v5 的「本地插件」形态：
 *   - 在 quartz.config.yaml 里用相对路径引用（source: ./plugins/reading-time）
 *   - 构建时被软链到 .quartz/plugins/ 再动态 import，不需要单独打包
 *   - 只读取文档内容，不写回 content/ 里的任何文件
 *
 * 插件契约（transformer）：
 *   { name, textTransform?, markdownPlugins?, htmlPlugins?, externalResources? }
 * 这里用 htmlPlugins 在 HAST 上操作，把结果插到正文最前面。
 */

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g

/** 递归收集 HAST 里的纯文本（跳过代码块与行内代码的额外噪音） */
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

          // 太短的页面（首页、列表页、标签页）不显示
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
