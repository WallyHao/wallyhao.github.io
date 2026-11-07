# blog-wallyhao

一个极简的个人博客，基于 [Quartz v5](https://quartz.jzhao.xyz/)。

设计上只有四条约束，其余都是推论：

1. **数据层只有文档。** `content/` 下全是 Markdown，没有数据库、CMS 和额外的 JSON 数据文件。
2. **派生数据只存在于构建期。** 标签、目录、最近更新、阅读时间都是构建时从文档里算出来的。
3. **功能靠插件扩展。** 功能要么是 npm 上的插件，要么是 `plugins/` 下的本地插件，在 `quartz.config.yaml` 里装配。
4. **前端不能写回数据层。** 站点是纯静态产物，没有可写的服务端接口。

---

## 快速开始

需要 Node.js >= 22。

```bash
npm ci                      # 首次安装依赖（用 npm i 也可以）
npx quartz build --serve    # 本地预览 http://localhost:8080
npx quartz build            # 只构建，产物在 public/
```

改完 `quartz.config.yaml` 或插件后重启 dev server 最稳妥。

## 目录结构

```
content/            唯一数据源：全部是 Markdown
  index.md          首页
  about.md          关于（unlisted）
  posts/            文章目录，自动生成 /posts 列表页
quartz.config.yaml  站点参数 + 插件装配 + 页面骨架
quartz.ts           TS 覆写层：函数型配置、自定义 layout 条件
plugins/            本地插件（示例：reading-time）
quartz/             Quartz 内核，含插件管线
docs/               Quartz 自带文档，不参与本站构建
public/             构建产物（已 gitignore）
```

`quartz.config.yaml` 里没有内容数据，`content/` 里没有配置。两者不交叉。

## 写文章

在 `content/posts/` 下新建一个 `.md` 文件即可，文件名就是 URL（slug）。

```markdown
---
title: 标题
date: 2025-11-05
description: 一句话摘要，用于列表页、搜索和 og:description。
tags:
  - quartz
---

正文……
```

常用的 frontmatter 字段：

| 字段          | 作用                                                |
| ------------- | --------------------------------------------------- |
| `title`       | 标题，缺省时用文件名                                |
| `date`        | 日期，缺省时依次回退到 git 提交时间、文件系统时间   |
| `description` | 摘要，用于列表、搜索、RSS、社交卡片                 |
| `tags`        | 标签，自动生成 `/tags/<tag>` 页面                   |
| `draft`       | `true` 时不会发布（`remove-draft` 过滤器）          |
| `unlisted`    | `true` 时不进列表 / RSS / 搜索，但仍可通过 URL 访问 |
| `aliases`     | 旧链接，自动生成跳转页                              |
| `enableToc`   | `false` 时关闭该页右侧目录                          |

内链用 `[[posts|全部文章]]` 或普通 Markdown 链接；`crawl-links` 插件配置的是
`markdownLinkResolution: shortest`，即按文件名就近解析。

## 改站点

站点级参数都在 `quartz.config.yaml` 的 `configuration` 段：

- `pageTitle` / `pageTitleSuffix`：站点标题
- `baseUrl`：**部署前必须改成自己的域名**（不带 `https://`），影响 RSS、sitemap、canonical URL
- `locale`：界面语言，当前 `zh-CN`
- `theme.colors` / `theme.typography`：配色与字体
- `analytics`：当前为 `null`，不加载任何统计脚本

页面骨架在文件末尾的 `layout` 段：`left` / `right` / `beforeBody` / `afterBody` / `footer`
每个插槽里放哪些组件、优先级多少。例如想把文件树侧边栏加回来，把 `explorer`
的 `enabled` 改成 `true` 即可。

## 外观

三层叠起来：

| 层   | 文件                                                                  | 作用                                                              |
| ---- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 结构 | `@quartz-themes/core` + `theme: ink-paper`                            | 间距、标题层级、引用块、表格等版式                                |
| 配色 | `quartz.config.yaml` 的 `theme.colors` + `quartz/styles/custom.scss`  | 墨观 Inkstone 的 **宣纸 Dimmed**（浅色）/ **玄墨 Dimmed**（深色） |
| 字体 | `quartz/styles/lxgw-wenkai.scss` + `quartz/static/fonts/lxgw-wenkai/` | 霞鹜文楷 Screen，97 个 woff2 子集自托管                           |

`custom.scss` 里的变量覆盖写在 Quartz 的 `@layer quartz-base` **之外**，
所以无条件压过主题自带的值——想改颜色，只改那里和 `theme.colors` 两处保持一致即可。

换字体：

1. 把新的 webfont 的 `*.woff2` 放进 `quartz/static/fonts/<名字>/files/`；
2. 用它的 CSS 生成一份 `quartz/styles/<名字>.scss`，把 `url('./files/...')`
   改成 `url('./static/fonts/<名字>/files/...')`；
3. 在 `custom.scss` 顶部 `@use "./<名字>.scss";`，并把 `--bodyFont` / `--headerFont` /
   `--titleFont` / `--font-text` / `--font-interface` / `--font-default` 换成新字体名；
4. `quartz.config.yaml` 里 `theme.typography` 同步改名，保持 `fontOrigin: local`。

字体自托管意味着不依赖 Google Fonts / jsDelivr，代价是仓库里多了约 5 MB 的 woff2
（浏览器只会按 `unicode-range` 下载真正用到的子集，首屏通常几百 KB）。

> `og-image` 插件目前是关的：它要下载 Google 字体来画社交卡片，自托管字体取不到。
> 需要社交卡片时，把 `theme.typography` 临时换成一个 Google 字体并重新打开该插件。

## 写插件

三种来源，写在 `plugins:` 列表里：

```yaml
plugins:
  # 1. npm 包（Quartz 官方社区插件）
  - source: "@quartz-community/recent-notes"
    enabled: true

  # 2. 任意 Git 仓库
  - source: "github:someuser/quartz-plugin-foo"

  # 3. 本地目录（软链进 .quartz/plugins/，改完直接生效）
  - source: ./plugins/reading-time
    enabled: true
    order: 75
```

插件类别对应管线的四个阶段：

| 类别          | 职责                                   | 关键方法                                            |
| ------------- | -------------------------------------- | --------------------------------------------------- |
| `transformer` | 改 Markdown / HTML，或给文档加派生字段 | `textTransform` / `markdownPlugins` / `htmlPlugins` |
| `filter`      | 决定哪些文档发布                       | `shouldPublish`                                     |
| `emitter`     | 输出页面之外的文件（RSS、sitemap…）    | `emit`                                              |
| `pageType`    | 定义某一类页面怎么渲染                 | `match` / `body` / `layout`                         |
| `component`   | 纯 UI，塞进 layout 插槽                | 组件本身                                            |

`plugins/reading-time/` 是一个可直接照抄的最小示例（纯 ESM，没有构建步骤、没有依赖）：
它统计正文里的中日韩字符数和英文词数，算出预计阅读时间并插到正文最前面。
复制这个目录改个名字，就能开始写自己的插件。

`order` 控制同一类别内的执行顺序，插件之间的依赖靠它保证（有依赖时构建会报错提示）。

插件命令：

```bash
npx quartz plugin add github:user/repo   # 安装
npx quartz plugin install --from-config  # 按配置补齐所有插件
npx quartz plugin list                   # 查看已安装
```

## 「只读」是怎么保证的

- 站点是 **静态构建**：`public/` 里只有 HTML/JS/CSS，没有 `/api`，没有会话，没有可 POST 的端点。
- 插件在构建期拿到的是文档内容 + 文件元数据，管线里没有「写回 content/」这一步。
- 想让约束变成硬性的，可以在 CI 里做两件事：
  1. 构建时把 `content/` 只读挂载（Docker `-v $PWD/content:/app/content:ro`）；
  2. 构建后跑一次 `git diff --exit-code content/`，任何插件偷偷改文档都会让流水线失败。

需要持久化的交互（评论、点赞）不要塞进数据层，用外部服务（例如 giscus，数据存在 GitHub Discussions）
或者干脆不做——一旦引入可写后端，这条约束就失效了。

## 对 Quartz 内核做的改动

只有两处，升级 Quartz 时注意合并：

1. `quartz/plugins/pageTypes/404.ts`：给生成的 404 页面数据加 `unlisted: true`，
   否则它会出现在「最近更新」列表和搜索结果里。
2. `quartz.ts`：注册了一个自定义 layout 条件 `index`（只在首页渲染），
   用于让 `recent-notes` 只出现在首页。内置条件只有 `not-index` / `has-tags` /
   `has-backlinks` / `has-toc`。

## 部署

1. 把 `quartz.config.yaml` 里的 `baseUrl` 改成真实域名；
2. 推到 GitHub 后按 [Hosting 文档](https://quartz.jzhao.xyz/hosting) 接 GitHub Pages / Cloudflare Pages / Vercel；
3. `.github/workflows/` 里是 Quartz 上游的 CI 配置，其中 `deploy-v5.yaml` 只对上游仓库生效，
   需要的话换成自己的部署 action。

## 上游

Quartz 由 [jackyzha0](https://github.com/jackyzha0) 开发，MIT 协议。
文档见 https://quartz.jzhao.xyz/ ，仓库 https://github.com/jackyzha0/quartz 。
