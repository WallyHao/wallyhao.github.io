# AGENTS.md

给在本仓库工作的智能体（以及未来的人类贡献者）看的说明。**动手前请先读完本文件。**

## 这是什么

一个极简个人博客，基于 Quartz v5 静态生成。四条约束，其余都是推论：

1. 数据层只有文档，没有数据库、CMS 或额外的结构化数据文件。
2. 派生数据（标签、目录、最近更新、阅读时间）只存在于构建期。
3. 功能靠插件扩展，配置在 `quartz.config.yaml`。
4. 站点是纯静态产物，前端不能写回数据层。

## 最重要的一件事：文章是 org-lite，不是 Markdown

**文章写在 `org/` 目录，用 org-lite 语法。不要写 `content/`。**

```
org/                ← 唯一数据源，在这里写文章（.org）
content/            ← 生成物，由脚本产出，禁止手改
public/             ← 构建产物，禁止手改
```

- **org-lite 不是 Markdown，也不是完整的 Org mode。** 它只保留了一部分语法：
  标题、段落、列表、复选框、行内格式、上下标、实体、LaTeX、链接、表格、
  属性抽屉、`#+NAME:` / `#+CAPTION:`、SRC/EXAMPLE/QUOTE/COMMENT 块、脚注。
- **完整 Org 的特性它没有**：TODO 状态、标签、时间戳、`SCHEDULED`/`DEADLINE`、
  宏、`#+INCLUDE`、表格公式、`VERSE`/`CENTER`/`EXPORT` 块、匿名脚注等。
  这些写法会被当成普通文字。
- 语法细节见 **`docs/org/`**（见下一节），不要凭 Org mode 的经验想当然。

上游仓库（公开）：<https://github.com/WallyHao/org-lite>

## 语法说明在 `docs/org/`

`docs/org/` 是上游文档的逐字拷贝，**改代码或写作前先查这里**：

| 文件                    | 查什么                                   |
| ----------------------- | ---------------------------------------- |
| `docs/org/syntax.md`    | 能写什么、怎么写，附例子（**先看这个**） |
| `docs/org/reference.md` | 精确边界、优先级、错误恢复规则           |
| `docs/org/examples.md`  | 正例与反例                               |
| `docs/org/model.md`     | 解析结果的数据模型与 `parse` / `analyze` |

这些文件不要在这里修改，它们是拷贝，更新方式见 `docs/org/README.md`。

## 写一篇文章

在 `org/posts/` 下新建 `.org` 文件，文件名就是 URL（slug）。首页/关于这类页面放在 `org/` 根下。

```org
#+TITLE: 标题
#+DATE: 2025-11-05
#+DESCRIPTION: 一句话摘要，用于列表页、搜索和 og:description。
#+TAGS: quartz, architecture

正文段落，可以写 *粗体*、/斜体/、_下划线_、+删除线+、~行内代码~。

** 第一节

- 列表项
- [ ] 待办
- [X] 已完成

| 名称 | 数量 |
|------+------|
| 苹果 | 3 |

#+BEGIN_SRC python
print("hello")
#+END_SRC
```

元数据会转成 Quartz 需要的 YAML frontmatter：

| org 元数据      | frontmatter   | 说明                                        |
| --------------- | ------------- | ------------------------------------------- |
| `#+TITLE`       | `title`       | 缺省时用文件名                              |
| `#+DATE`        | `date`        | 缺省时回退到文件时间（生成物没有 git 历史） |
| `#+DESCRIPTION` | `description` | 摘要                                        |
| `#+TAGS`        | `tags`        | 空格或逗号分隔                              |
| `#+DRAFT`       | `draft`       | `true` 不发布                               |
| `#+UNLISTED`    | `unlisted`    | `true` 不进列表 / RSS / 搜索                |
| `#+ALIASES`     | `aliases`     | 旧链接跳转                                  |

链接**必须写 `file:` 前缀**，否则会被当成文档内锚点：

```org
[[file:posts/][全部文章]]         → /posts/
[[file:about.org][关于]]          → /about
[[file:notes.org::*计划][计划]]   → /notes#计划
[[https://example.com][外链]]     → 外部链接
```

`org/` 下除 `.org` 以外的文件（图片等）会原样同步到 `content/`，可以直接用相对路径引用。

## 构建与验证

需要 **Node.js >= 24.12**（org-lite 的要求）。

```bash
npm ci                 # 首次安装
npm run org            # org/ → content/，只转换
node scripts/org-to-md.mjs --check   # 只检查，不写文件
npm run preview        # 转换 + 本地预览 http://localhost:8080
npm run build          # 转换 + 构建
npx tsc --noEmit       # 类型检查
npx prettier --check . # 格式检查
```

转换时如果出现 `unsupported` / `unclosed` / `orphan` 提示，说明那段 org 语法没被识别，
**不要忽略**——要么改成受支持的写法，要么明确接受降级。

## 生成链路

```
org/*.org
  └─ scripts/org-to-md.mjs        读文件、解析、转 mdast、序列化
       ├─ vendor/org-lite/dist    org-lite 解析器（上游构建产物，勿手改）
       └─ mdast-util-to-markdown  负责 Markdown 转义与排版
            ↓
content/*.md                      生成物（.gitignore），带 YAML frontmatter
            ↓
Quartz v5 插件管线                transformers → filters → emitters → HTML
```

`scripts/org-to-md.mjs` 的职责边界：**只做格式翻译**。它不生成页面、不管样式、
不写 `content/` 之外的东西（`.org-to-md.json` 清单用于清理过期产物）。

## 仓库地图

```
org/                    文章源文件（org-lite）
content/                org → md 的生成物，禁止手改
scripts/org-to-md.mjs   转换器
vendor/org-lite/        org-lite 解析器副本（上游 dist）
plugins/                本地 Quartz 插件（reading-time、default-theme）
docs/org/               org-lite 语法文档拷贝
docs/                   Quartz 自带文档，不参与本站构建
quartz/                 Quartz 内核
quartz.config.yaml      站点参数 + 插件装配 + 页面骨架
quartz.ts               TS 覆写层（自定义 layout 条件）
```

## 不要做的事

- ❌ 不要手改 `content/`、`public/`、`.quartz/`——都是生成物。
- ❌ 不要在 `org/` 里写 Markdown：`## 标题`、`[文字](链接)`、` ``` ` 代码块、`- [ ]` 之外的任务语法都不生效。
  对应的 org 写法是 `** 标题`、`[[file:x.org][文字]]`、`#+BEGIN_SRC`。
- ❌ 不要直接改 `vendor/org-lite/`，更新方式见 `vendor/org-lite/README.md`。
- ❌ 不要把 `content/` 加回 git，也不要在 `quartz.util/glob` 里恢复 `gitignore: true`
  （见下面「内核改动」）。
- ❌ 不要引入需要写回数据层的功能（评论、收藏等）；要持久化就用外部服务。
- ❌ 不要删 `plugins/default-theme/`：它在 `<head>` 里把首次访问的主题钉成亮色，
  删了会退回「跟随系统深色偏好」。要改默认值就改它的 `options.theme`。

## 对 Quartz 内核的改动

只有三处，升级 Quartz 时注意合并：

1. `quartz/plugins/pageTypes/404.ts`：给生成的 404 页面数据加 `unlisted: true`，
   否则它会出现在「最近更新」和搜索里。
2. `quartz.ts`：注册自定义 layout 条件 `index`，让 `recent-notes` 只出现在首页。
3. `quartz/util/glob.ts`：`gitignore: false`。`content/` 是生成物且在 `.gitignore` 里，
   但构建仍要读它；忽略规则统一交给 `quartz.config.yaml` 的 `ignorePatterns`。

## 已知限制（有意为之）

- 复选框只有两态，`[-]` 输出 `[ ]` + `<!-- partial -->`。
- `#+CAPTION:` 变成斜体段落，`#+NAME:` 变成锚点，没有图表编号。
- 链接里的 `::25` 行号、`::/正则/` 选择器丢弃。
- 有序列表会按 Markdown 规则重新编号。
- 属性抽屉只取 `ID` / `CUSTOM_ID`。
- 注释块不输出。

完整清单见 `README.md` 的「转换器的边界」。

## 提交规范

- 使用 [Conventional Commits](https://www.conventionalcommits.org/)：`feat:` / `fix:` / `docs:` /
  `refactor:` / `chore:`，可带 scope，如 `fix(theme): ...`。
- **提交信息用英文**，正文说明「为什么」，不复述 diff。
- 一次提交只做一件事；涉及内核补丁时在正文里写明改了哪个文件、为什么。
