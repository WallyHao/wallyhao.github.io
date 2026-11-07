# vendor/org-lite

[org-lite](https://github.com/WallyHao/org-lite) 的构建产物（`dist/`）副本，
供 `scripts/org-to-md.mjs` 在构建期解析 `.org` 文档。

上游仓库是私有的，CI/部署机不一定能拉到，所以把编译结果直接放进仓库，
避免 `file:` 依赖或私有 npm 源。只保留 `.js`（去掉 `.map` 与 `.d.ts`）。

- 来源：`https://github.com/WallyHao/org-lite`
- 提交：见 `COMMIT`
- 版本：`package.json` 里的 `version`

## 更新

```bash
cd /path/to/org-lite && npm run build
rsync -a --delete --exclude='*.map' --exclude='*.d.ts' dist/ \
  /path/to/blog-wallyhao/vendor/org-lite/dist/
git -C /path/to/org-lite rev-parse HEAD > /path/to/blog-wallyhao/vendor/org-lite/COMMIT
```

更新后跑一遍 `npm run org` 和 `npm test`，确认转换结果没有变化。
