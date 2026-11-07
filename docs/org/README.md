# org-lite 语法文档（拷贝）

本目录是 [org-lite](https://github.com/WallyHao/org-lite) 官方文档的**逐字拷贝**，
供写作和改代码时查阅，不是本站的文档，也不要在这里写文章。

| 文件           | 内容                                     |
| -------------- | ---------------------------------------- |
| `syntax.md`    | 语法指南：能写什么、怎么写，附例子       |
| `reference.md` | 语法参考：精确边界、优先级、错误恢复规则 |
| `examples.md`  | 规范示例：正例与反例                     |
| `model.md`     | 数据模型与 `parse` / `analyze` 接口契约  |

- 来源：<https://github.com/WallyHao/org-lite>
- 同步自 commit：`09b417f`（见 `vendor/org-lite/COMMIT`，两者应保持一致）
- 本站使用的解析器：`vendor/org-lite/dist`，经 `scripts/org-to-md.mjs` 调用

## 更新方式

```bash
git -C /path/to/org-lite fetch && git -C /path/to/org-lite checkout <commit>
cp /path/to/org-lite/docs/{syntax,reference,examples,model}.md docs/org/
```

解析器本体和文档要一起更新：先按 `vendor/org-lite/README.md` 更新 `dist/`，
再拷贝这四份文档，最后跑一遍 `npm run org`，确认文章转换结果没有变化。
