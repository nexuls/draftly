# C-008 — Replace ESLint + Prettier with Biome

**Status:** Complete
**Priority:** Medium
**Completed:** 2026-08-18
**Requested by:** the developer, with
[`vercel/turborepo/examples/with-biome`](https://github.com/vercel/turborepo/tree/main/examples/with-biome)
as the reference layout.

## Problem

The repo ran two tools with overlapping jurisdiction: Prettier for formatting (root
`.prettierrc`) and ESLint 9 flat configs per package, glued together with
`eslint-config-prettier`. That meant two dependency trees, two config formats, two passes
over the source, and a shared config package (`@workspace/eslint-config`) whose only job was
to paper over the seams.

It also under-delivered. `@workspace/eslint-config/base.js` loaded
`eslint-plugin-only-warn`, which downgrades **every** rule to a warning — so `bun run lint`
could not fail, in any package except `packages/ui` (which passed `--max-warnings 0`). There
was no a11y plugin at all.

## Outcome

Biome 2.5.8 does both jobs. Structure mirrors the Turborepo reference example, adapted to
this repo's `@workspace/*` scope:

```
biome.json                          # "root": true
packages/biome-config/              # @workspace/biome-config
  base.json                         # formatter + recommended lint
  react-internal.json               # react domain
  next.json                         # next + react domains
packages/draftly/biome.json         # extends base
packages/ui/biome.json              # extends base + react-internal
apps/web/biome.json                 # extends base + next-js
```

### Deviations from the reference example

| Reference                             | Here                                  | Why |
| ------------------------------------- | ------------------------------------- | --- |
| Tab indentation                       | 2 spaces                              | Matches the repo's existing Prettier config. Switching would have rewritten every file for no gain. |
| Keeps Prettier in root devDeps        | Prettier removed entirely             | The ask was to replace it. Biome 2.5 does not format Markdown, so `.md` files are now unformatted — see "Known gap". |
| `base.json` enumerates ~90 rules      | `"preset": "recommended"` + overrides | The reference's list is `biome migrate eslint` output frozen in time. A preset plus a short, *reasoned* override table is smaller and does not rot. |
| `lint` script is `biome check --write`| `lint` is read-only; `lint:fix` writes| A lint task that mutates the tree is wrong in CI and wrong under Turborepo caching. |

### Scripts

Root: `lint`, `lint:fix`, `format` (all via turbo) plus `check` / `check:fix` which run
Biome across the whole repo in one pass. Each workspace: `lint` (`biome check`), `lint:fix`
(`biome check --write`), `format` (`biome format --write`).

`turbo.json` gained `lint:fix` and `format` as `cache: false` tasks — they mutate the tree,
so a cache hit would skip work that was meant to happen. `lint` gained `biome.json` and
`../../biome.json` to its `inputs`.

### Source changes

`biome check --write` (safe fixes only, no `--unsafe`) touched 84 files. Almost all of it
was `style/useImportType` — splitting type-only imports out — plus JSON array reflowing.
Hand-fixed on top: two unused `React` imports, `isNaN` → `Number.isNaN`, `==` → `===`, and
five `let match;` declarations given `RegExpExecArray | null` annotations. The three stale
`eslint-disable` comments were removed or converted to `biome-ignore`.

`tsc --noEmit` passes in both `packages/draftly` and `apps/web`; `bun run build` passes.

## Known gaps

- **Markdown is no longer formatted.** Biome 2.5 has no Markdown formatter. `artifacts/`
  and the READMEs are now hand-maintained. If this bites, the options are re-adding Prettier
  for `*.md` only, or waiting for Biome's Markdown support.
- **91 warnings outstanding.** See memory Q7. Mostly `noNonNullAssertion` (34, in the
  plugins) and newly-gained a11y findings in `packages/ui`'s vendored shadcn components.
  Pinned to `warn` so the migration landed green, not because they are acceptable forever.
- **`preview/renderer.ts` has two never-read private fields** (`theme`, `sanitizeHtml`).
  Biome flagged them; left in place and raised as memory Q8 rather than deleted, since a
  dead field in a pipeline that has a documented sanitisation gap (T-003) may be the visible
  end of a real bug.

## Verification

- `bun run lint` — 3/3 tasks pass, 0 errors.
- `bunx biome check --reporter=github` — no `::error` lines.
- `bun run typecheck` in `packages/draftly` and `apps/web` — clean.
- `bun run build` — 2/2 tasks pass.
- **Not** verified: the playground's 8-step visual checklist. This change touches no
  rendering logic, but `useImportType` did rewrite imports in every plugin file, so a
  playground pass before merging is cheap insurance.

## Artifacts updated

`architecture/build-and-tooling.md` (rewritten "Code style" section), `architecture/index.md`,
`repository-map.md`, `memory.md` (Biome facts + Q7, Q8), `AGENTS.md`, `CONTRIBUTING.md`,
`.vscode/settings.json`, `.vscode/extensions.json`.
