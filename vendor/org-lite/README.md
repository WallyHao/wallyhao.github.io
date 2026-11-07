# vendor/org-lite

Build output (`dist/`) of [org-lite](https://github.com/WallyHao/org-lite), used by
`scripts/org-to-md.mjs` to parse `.org` documents at build time.

The package is vendored instead of pulled in as a dependency so the build stays reproducible
and works offline: no `file:` path outside the repository, no private registry, no git
access during CI. Only `.js` files are kept; `.map` and `.d.ts` are stripped.

- Upstream: <https://github.com/WallyHao/org-lite>
- Synced commit: see `COMMIT`
- Version: `version` in `package.json`

## Refreshing

```bash
cd /path/to/org-lite && npm run build
rsync -a --delete --exclude='*.map' --exclude='*.d.ts' dist/ \
  /path/to/blog-wallyhao/vendor/org-lite/dist/
git -C /path/to/org-lite rev-parse HEAD > /path/to/blog-wallyhao/vendor/org-lite/COMMIT
```

Refresh `docs/org/` in the same change (see `docs/org/README.md`), then run `npm run org`
and confirm the generated Markdown did not change unexpectedly.
