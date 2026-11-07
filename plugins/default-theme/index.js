/**
 * 本地插件：固定默认主题。
 *
 * Quartz 的 darkmode 组件在首次访问时会跟随系统偏好
 * （prefers-color-scheme: dark → 暗色）。这里在 <head> 里、在 darkmode
 * 脚本之前，把 localStorage 的 theme 补成指定值，让「首次访问」落在指定主题上。
 * 用户手动切换后仍以自己的选择为准（localStorage 已有值时不覆盖）。
 */
export default function DefaultTheme(opts = {}) {
  const theme = opts.theme === "dark" ? "dark" : "light"

  return {
    name: "DefaultTheme",
    // Quartz 用这几个方法判断插件类别；这里不需要改文档，给个空实现
    markdownPlugins() {
      return []
    },
    externalResources() {
      return {
        js: [
          {
            loadTime: "beforeDOMReady",
            contentType: "inline",
            spaPreserve: true,
            script: [
              "(function () {",
              "  try {",
              '    if (localStorage.getItem("theme")) return;',
              "    localStorage.setItem(" +
                JSON.stringify("theme") +
                ", " +
                JSON.stringify(theme) +
                ");",
              "    // darkmode 脚本先于本文件执行，已按系统偏好设过一遍属性，这里纠正回来",
              '    document.documentElement.setAttribute("saved-theme", ' +
                JSON.stringify(theme) +
                ");",
              "    if (document.body) {",
              '      document.body.classList.remove("theme-dark", "theme-light");',
              '      document.body.classList.add("theme-" + ' + JSON.stringify(theme) + ");",
              "    }",
              "  } catch (err) {}",
              "})();",
            ].join("\n"),
          },
        ],
      }
    },
  }
}
