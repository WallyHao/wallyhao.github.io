# blog-wallyhao

A minimal personal blog built with [Quartz v5](https://quartz.jzhao.xyz/).

> Posts are written in [org-lite](https://github.com/WallyHao/org-lite) syntax under `org/`
> and converted to Markdown at build time. **See [AGENTS.md](AGENTS.md) for the full guide for
> agents and contributors.** The syntax reference lives in [`docs/org/`](docs/org/).

The design follows four constraints; everything else derives from them:

1. **Documents are the only data layer.** Everything under `org/` is an org-lite document —
   no database, no CMS, no extra structured data files.
2. **Derived data exists only at build time.** Tags, listings, recent posts and reading time
   are computed from the documents during the build.
3. **Features are added through plugins.** A feature is either an npm plugin or a local
   plugin under `plugins/`, wired in `quartz.config.yaml`.
4. **The frontend cannot write back.** The site is static output with no writable server
   endpoint.

---

## Quick start

Requires Node.js >= 24.12 (org-lite requirement).

```bash
npm ci            # first install (npm i also works)
npm run org       # org/ -> content/, conversion only
npm run preview   # convert + serve on http://localhost:8080
npm run build     # convert + build, output in public/
```

`content/` is generated: run `npm run org` before a bare `npx quartz build`. Restart the dev
server after changing `quartz.config.yaml` or a plugin.

## Layout

```
org/                the only source of truth: org-lite documents
  index.org         home page
  about.org         about page (unlisted)
  posts/            posts; the /posts listing page is generated
content/            generated Markdown (gitignored)
scripts/org-to-md.mjs  converter
vendor/org-lite/    org-lite parser snapshot (upstream dist)
docs/org/           org-lite syntax documentation (read this before writing)
AGENTS.md           guide for agents and contributors
quartz.config.yaml  site settings, plugin wiring, page skeleton
quartz.ts           TypeScript override layer (custom layout conditions)
plugins/            local plugins (reading-time, default-theme)
quartz/             Quartz core and plugin pipeline
public/             build output (gitignored)
```

`quartz.config.yaml` holds no content data and `org/` holds no configuration; the two never
overlap. `content/` is an intermediate artifact — do not edit it, the next `npm run org`
overwrites it.

## Writing a post

Create a `.org` file under `org/posts/`; the file name is the URL slug. Leading `#+KEY:`
lines are metadata and become the YAML frontmatter Quartz expects:

```org
#+TITLE: Title
#+DATE: 2025-11-05
#+DESCRIPTION: One-sentence summary used by listings, search and og:description.
#+TAGS: quartz, architecture

Body text with *bold*, /italic/, _underline_, +strike+ and ~inline code~.

** A section

A paragraph.
```

| org metadata    | frontmatter   | Purpose                                                                  |
| --------------- | ------------- | ------------------------------------------------------------------------ |
| `#+TITLE`       | `title`       | Title, falls back to the file name                                       |
| `#+DATE`        | `date`        | Date, falls back to the file mtime (generated files have no git history) |
| `#+DESCRIPTION` | `description` | Summary used by listings, search and RSS                                 |
| `#+TAGS`        | `tags`        | Space or comma separated; `/tags/<tag>` pages are generated              |
| `#+DRAFT`       | `draft`       | `true` keeps it unpublished                                              |
| `#+UNLISTED`    | `unlisted`    | `true` hides it from listings, RSS and search                            |
| `#+ALIASES`     | `aliases`     | Old links that should redirect                                           |

Links must use the `file:` prefix so the converter can translate them into site paths:

```org
[[file:posts/][All posts]]        -> /posts/
[[file:about.org][About]]         -> /about
[[file:notes.org::*Plan][Plan]]   -> /notes#plan
[[id:project-001][Project]]       -> cross-document ID, resolved in a second pass
[[https://example.com][External]] -> external link
```

`*bold*` becomes `**bold**`, `/italic/` becomes `*italic*`, `~code~` becomes `` `code` ``,
while `_underline_` and sub/superscripts are emitted as inline HTML.

### This is org-lite, not Org mode

The parser is `vendor/org-lite/`. It implements a defined subset, does not load Emacs and does
not support full Org. The following full-Org constructs are treated as **plain text** (no
error, no interpretation):

- TODO states, priorities and headline tags (`TODO` in `* TODO [#A] Task :work:` is just text)
- Timestamps, `SCHEDULED:` / `DEADLINE:` / `CLOCK:`
- Generic drawers such as `LOGBOOK`, and `#+FILETAGS:` / `#+OPTIONS:` / `#+INCLUDE:` /
  `#+MACRO:` / `#+CALL:`
- Table formulas `#+TBLFM:`
- `VERSE` / `CENTER` / `EXPORT` and custom blocks
- Single-line verbatim regions (`: text`)
- Anonymous footnotes `[fn::...]` and radio targets `<<<x>>>`
- The `+ item`, `1) item` and indented `* item` list styles
- Bare URLs, `<https://...>` and `mailto:` / `attachment:` links

### Converter boundaries

Within the org-lite subset the mapping is complete. These are intentional degradations:

- **Checkboxes have two states.** `[X]` / `[ ]`; `[-]` becomes `[ ]` plus a
  `<!-- partial -->` comment so the original state survives in the source.
- **No callouts.** org-lite only has QUOTE blocks, which become Markdown blockquotes.
- **`#+CAPTION:` becomes an italic paragraph**, `#+NAME:` becomes an `<a id>` anchor; there is
  no figure numbering.
- **`::NN` line selectors and `::/regexp/` selectors are dropped**; only the file part of the
  link is kept, since a static site has nothing to select.
- **Ordered lists are renumbered.** `1.` `3.` becomes `1.` `2.` (Markdown numbering is not
  rendered).
- **Property drawers only contribute `ID` / `CUSTOM_ID`**; other keys (`OWNER`, ...) are dropped.
- **Comment blocks** (`# comment` / `#+BEGIN_COMMENT`) are not emitted.
- **Unknown `#+` lines are kept as text**, which is org-lite's own semantics.

Non-`.org` files under `org/` (images and so on) are copied to `content/`, so file links work
directly. Unrecognized syntax produces `unsupported` / `unclosed` / `orphan` warnings with
line numbers during conversion.

## Customizing the site

Site-level settings live in the `configuration` section of `quartz.config.yaml`:

- `pageTitle` / `pageTitleSuffix`: site title
- `baseUrl`: **must be your domain before deploying** (no `https://`); used by RSS, sitemap and
  canonical URLs
- `locale`: UI language, currently `zh-CN`
- `theme.colors` / `theme.typography`: palette and fonts
- `analytics`: currently `null`, no analytics script is loaded

The page skeleton is the `layout` section at the end of the file: which components go into
`left` / `right` / `beforeBody` / `afterBody` / `footer` and at what priority. To bring the
file tree back, for example, set `enabled: true` on `explorer`.

## Appearance

Three layers stack up:

| Layer        | File                                                                  | Purpose                                                          |
| ------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Structure    | `@quartz-themes/core` with `theme: ink-paper`                         | Spacing, heading scale, quote and table styling                  |
| Palette      | `theme.colors` in `quartz.config.yaml` + `quartz/styles/custom.scss`  | Inkstone **Xuanzhi Dimmed** (light) / **Xuanmo Dimmed** (dark)   |
| Type         | `quartz/styles/lxgw-wenkai.scss` + `quartz/static/fonts/lxgw-wenkai/` | LXGW WenKai Screen, 97 self-hosted woff2 subsets                 |
| Default mode | `plugins/default-theme/`                                              | First visit is light instead of following the OS dark preference |

Variable overrides in `custom.scss` sit **outside** Quartz's `@layer quartz-base`, so they
unconditionally win over the theme. When changing colors, keep that file and `theme.colors`
in sync.

To change the font:

1. Put the new webfont's `*.woff2` files into `quartz/static/fonts/<name>/files/`;
2. Turn its CSS into `quartz/styles/<name>.scss`, rewriting `url('./files/...')` to
   `url('./static/fonts/<name>/files/...')`;
3. `@use "./<name>.scss";` at the top of `custom.scss` and point `--bodyFont`, `--headerFont`,
   `--titleFont`, `--font-text`, `--font-interface` and `--font-default` at the new family;
4. Rename it in `theme.typography` in `quartz.config.yaml`, keeping `fontOrigin: local`.

Self-hosting the font removes the dependency on Google Fonts and jsDelivr, at the cost of
about 5 MB of woff2 in the repository (the browser only downloads the `unicode-range` subsets
it needs, usually a few hundred KB for a page).

> The `og-image` plugin is disabled: it downloads Google fonts to draw social cards, which is
> impossible with a self-hosted font. To restore social cards, switch `theme.typography` to a
> Google font and re-enable the plugin.

## Writing plugins

Three sources, all listed under `plugins:`:

```yaml
plugins:
  # 1. npm package (official Quartz community plugin)
  - source: "@quartz-community/recent-notes"
    enabled: true

  # 2. any Git repository
  - source: "github:someuser/quartz-plugin-foo"

  # 3. local directory (symlinked into .quartz/plugins/, edits take effect immediately)
  - source: ./plugins/reading-time
    enabled: true
    order: 75
```

Plugin categories map onto the four pipeline stages:

| Category      | Responsibility                              | Key methods                                         |
| ------------- | ------------------------------------------- | --------------------------------------------------- |
| `transformer` | Rewrite Markdown / HTML, add derived fields | `textTransform` / `markdownPlugins` / `htmlPlugins` |
| `filter`      | Decide which documents are published        | `shouldPublish`                                     |
| `emitter`     | Emit files other than pages (RSS, sitemap)  | `emit`                                              |
| `pageType`    | Define how a class of pages renders         | `match` / `body` / `layout`                         |
| `component`   | Pure UI dropped into a layout slot          | the component itself                                |

`plugins/reading-time/` is a minimal example worth copying (plain ESM, no build step, no
dependencies): it counts CJK characters and Latin words in the body, derives an estimated
reading time and prepends it to the article. Copy the directory, rename it, and you have your
own plugin.

`order` controls execution within a category and is how plugin dependencies are expressed
(the build fails with a hint when the order contradicts a declared dependency).

Plugin commands:

```bash
npx quartz plugin add github:user/repo   # install
npx quartz plugin install --from-config  # install everything the config references
npx quartz plugin list                   # list installed plugins
```

## How read-only is enforced

- The site is a **static build**: `public/` contains only HTML/JS/CSS, no `/api`, no sessions,
  no endpoint that accepts a POST.
- Plugins receive document content plus file metadata at build time; the pipeline has no
  "write back to content/" step.
- To make the constraint hard, do two things in CI:
  1. Mount `content/` read-only during the build (`docker -v $PWD/content:/app/content:ro`);
  2. Run `git diff --exit-code content/` after the build, so any plugin that mutates documents
     fails the pipeline.

Do not put stateful interactions (comments, likes) into the data layer. Use an external
service (giscus, for example, stores data in GitHub Discussions) or skip the feature —
introducing a writable backend invalidates the whole constraint.

## Core patches to Quartz

Three places only; merge them carefully when upgrading Quartz:

1. `quartz/plugins/pageTypes/404.ts`: mark the generated 404 page as `unlisted: true`,
   otherwise it shows up in recent posts and in search results.
2. `quartz.ts`: register a custom layout condition `index` (render on the home page only) so
   `recent-notes` appears there and nowhere else. The built-in conditions are `not-index`,
   `has-tags`, `has-backlinks` and `has-toc`.
3. `quartz/util/glob.ts`: `gitignore: false`. `content/` is generated and listed in
   `.gitignore`, but the build still has to read it; ignore rules come from `ignorePatterns`
   in `quartz.config.yaml` instead.

## Deployment

1. Set `baseUrl` in `quartz.config.yaml` to your real domain;
2. Push to GitHub and follow the [hosting docs](https://quartz.jzhao.xyz/hosting) for GitHub
   Pages / Cloudflare Pages / Vercel;
3. Use `npm run build` as the build command (the org -> md conversion is mandatory) and
   `public/` as the output directory.

The upstream `.github/`, `Dockerfile`, `CODE_OF_CONDUCT.md` and the Quartz documentation copy
have been removed: they only make sense in the upstream repository. Add your own CI using the
build command above when needed.

## Upstream

Quartz is built by [jackyzha0](https://github.com/jackyzha0) and released under the MIT
license. Documentation: <https://quartz.jzhao.xyz/>. Repository:
<https://github.com/jackyzha0/quartz>.
