/**
 * Local plugin: pin the default theme.
 *
 * On a first visit the Quartz darkmode component follows the OS preference
 * (prefers-color-scheme: dark -> dark). This plugin writes the configured
 * theme into localStorage from the <head>, right after the darkmode script
 * runs, so a first visit lands on the configured theme. An existing preference
 * is never overwritten, so a manual toggle keeps winning.
 */
export default function DefaultTheme(opts = {}) {
  const theme = opts.theme === "dark" ? "dark" : "light"

  return {
    name: "DefaultTheme",
    // Quartz detects the plugin category from these methods; nothing to transform here
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
              "    // The darkmode script runs first and applied the OS preference; correct it",
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
