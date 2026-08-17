# `@workspace/biome-config`

Shared [Biome](https://biomejs.dev) configuration for the Draftly monorepo. Biome replaces
both ESLint and Prettier — one binary, one config, linting and formatting together.

## Layers

| Export            | File                 | Use for                                              |
| ----------------- | -------------------- | ---------------------------------------------------- |
| `./base`          | `base.json`          | Every workspace. Formatter settings + recommended lint |
| `./react-internal`| `react-internal.json`| Packages that ship React components                  |
| `./next-js`       | `next.json`          | Next.js applications                                 |

`base` is not implied by the others — a package extends `base` **and** the layer it needs:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.8/schema.json",
  "root": false,
  "extends": ["@workspace/biome-config/base", "@workspace/biome-config/react-internal"]
}
```

## Formatter settings

Deliberately matched to the repository's previous Prettier configuration so that adopting
Biome did not rewrite every file:

- 2-space indentation, LF line endings, 120-column line width
- Double quotes, semicolons always, ES5 trailing commas, always-parenthesised arrow params

`assist.actions.source.organizeImports` is **off**. Import order in `packages/draftly` is
load-bearing in places (CodeMirror facet and extension precedence), so reordering imports is
a manual, reviewed change rather than an automatic one.

## Root vs. nested

The repository root holds a `biome.json` with `"root": true`. Every workspace config sets
`"root": false` — Biome 2.x requires exactly one root in a monorepo, and nested configs are
resolved relative to the file being checked.
