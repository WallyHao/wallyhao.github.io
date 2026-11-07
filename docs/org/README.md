# org-lite syntax reference (copied)

This directory holds a verbatim copy of the [org-lite](https://github.com/WallyHao/org-lite)
documentation. It is reference material for writing posts and for working on the converter,
**not** part of the published site, and no posts belong here.

| File           | Contents                                                        |
| -------------- | --------------------------------------------------------------- |
| `syntax.md`    | Syntax guide: what you can write and how, with examples         |
| `reference.md` | Syntax reference: exact boundaries, precedence, recovery rules  |
| `examples.md`  | Conformance examples: positive and negative cases               |
| `model.md`     | Data model and the `parse` / `analyze` interface contracts      |

## Provenance

- Upstream: <https://github.com/WallyHao/org-lite>
- Parser snapshot used by the site: `vendor/org-lite/dist`, commit recorded in `vendor/org-lite/COMMIT`
- These files are copied from the upstream working tree and are not modified here.
  Do not edit them: re-copy instead.

## Refreshing

```bash
git -C /path/to/org-lite fetch && git -C /path/to/org-lite checkout <commit>
cp /path/to/org-lite/docs/{syntax,reference,examples,model}.md docs/org/
```

Update the parser snapshot and these documents together: refresh `vendor/org-lite/dist`
first (see `vendor/org-lite/README.md`), then copy the four files, then run `npm run org`
and confirm the generated Markdown did not change unexpectedly.
