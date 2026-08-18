# Build & Tooling

> Last verified: 2026-08-19 · commit `fa72daf`

---

## Toolchain

| Concern         | Tool                   | Notes                                                |
| --------------- | ---------------------- | ---------------------------------------------------- |
| Package manager | **Bun 1.3.5**          | Pinned via `packageManager`; `bun.lock` is committed |
| Task runner     | **Turborepo 2.6.3**    | `turbo.json` at root                                 |
| Library bundler | **tsup 8.5**           | esbuild-based; emits ESM + CJS + `.d.ts`             |
| App framework   | **Next.js 16**         | App Router, Turbopack dev                            |
| Language        | **TypeScript 5.7/5.9** | Root pins 5.7.3; `packages/draftly` uses ^5.9.3      |
| Lint + format   | **Biome 2.5.8**        | One tool for both; `biome.json` per workspace        |
| Releases        | **Changesets**         | `baseBranch: master`, auto-commit on                 |

> `pnpm-workspace.yaml` exists for tooling that reads it, but **Bun is the package
> manager**. Never run `pnpm install` or `npm install` — it will produce a second,
> conflicting lockfile.

---

## Commands

Run from the repo root unless noted.

```bash
bun install                 # install everything

bun dev                     # turbo run dev — web (Turbopack) + draftly (tsup --watch)
bun run build               # turbo run build — respects ^build dependency order
bun run lint                # turbo run lint      — biome check, read-only, fails on errors
bun run lint:fix            # turbo run lint:fix  — biome check --write (safe fixes)
bun run format              # turbo run format    — biome format --write
bun run check               # biome check across the whole repo, from the root
bun run check:fix           # biome check --write across the whole repo

# Type checking is per-package (no root turbo task wired to it yet)
cd packages/draftly && bun run typecheck
cd apps/web        && bun run typecheck

# Release
bun changeset               # describe the change + pick a bump
bun run version-packages    # apply bumps, write CHANGELOG.md
bun run release             # build draftly, then changeset publish
```

### Task graph (`turbo.json`)

| Task          | `dependsOn`    | Outputs                             | Cached             |
| ------------- | -------------- | ----------------------------------- | ------------------ |
| `build`       | `^build`       | `.next/**` (minus cache), `dist/**` | yes                |
| `lint`        | `^lint`        | —                                   | yes                |
| `lint:fix`    | —              | —                                   | **no** (writes)    |
| `format`      | —              | —                                   | **no** (writes)    |
| `check-types` | `^check-types` | —                                   | yes                |
| `dev`         | —              | —                                   | **no**, persistent |

`build` includes `.env*` in its `inputs` so env changes bust the cache. `lint` adds
`biome.json` and `../../biome.json` to its `inputs`, so editing either the workspace config
or the root config invalidates the cached lint result.

`lint:fix` and `format` are `cache: false` — they mutate the working tree, and a cache hit
would skip work that was meant to happen.

> **Known gap:** the packages define a `typecheck` script, but `turbo.json` declares
> `check-types`. Nothing wires them together, so `turbo run check-types` finds no tasks.
> Tracked in [../tasks/ongoing/](../tasks/ongoing/).

---

## Library build (`tsup.config.ts`)

```ts
entry: ["src/index.ts", "src/editor/index.ts", "src/plugins/index.ts",
        "src/preview/index.ts", "src/lib/index.ts"]
format: ["esm", "cjs"]
dts: true, splitting: true, sourcemap: true, clean: true, treeshake: true
```

Nine entries, one per subpath export. `splitting: true` plus `treeshake: true` is what
lets a consumer importing only `draftly/preview` avoid pulling in mermaid and KaTeX.

### Plugin entry points

Four of the nine entries exist purely for bundle size:

| Entry                    | Exports                    | Pulls                |
| ------------------------ | -------------------------- | -------------------- |
| `src/plugins/index.ts`   | 11 light plugins, `createEssentialPlugins()` | nothing heavy |
| `src/plugins/mermaid.ts` | `MermaidPlugin`            | `mermaid`, 5.3 MB    |
| `src/plugins/math.ts`    | `MathPlugin`               | `katex`, 475 KB      |
| `src/plugins/emoji.ts`   | `EmojiPlugin`              | `node-emoji`, 312 KB |
| `src/plugins/all.ts`     | `createAllPlugins()`       | all three            |

**Why this is structural and not stylistic.** tsup concatenates everything reachable from
an entry point into one chunk. Before C-027 all 14 plugins were reachable from
`src/plugins/index.ts`, so they were emitted as a single 223 KB chunk whose *top level*
read:

```js
import katex from 'katex';
import mermaid from 'mermaid';
import * as emoji from 'node-emoji';
```

A top-level import in a retained chunk is evaluated whenever any binding in that chunk is
used. `import { HeadingPlugin } from "draftly/plugins"` therefore bundled to **8.0 MB**.
Tree-shaking cannot rescue this: `sideEffects: false` lets a bundler drop draftly's own
modules, but mermaid and katex are third-party packages it cannot prove pure, and CJS
consumers get no tree-shaking at all.

Splitting the three into their own entries puts them in their own chunks. The same import
is now **2.5 MB**, and `dist/plugins/index.{js,cjs}` reaches no heavy dependency by either
module system.

`createAllPlugins()` lives in `all.ts` rather than beside `createEssentialPlugins()` for
exactly this reason — one function referencing `MermaidPlugin` from the barrel module would
put mermaid back in the light chunk and silently undo the split. **Adding a heavy plugin to
`src/plugins/index.ts` is the one edit that reverts this change.**

### Externals

Every `@codemirror/*` and `@lezer/*` package is marked external and declared as a
**peer dependency**. This is deliberate and important: CodeMirror breaks badly if two
copies of `@codemirror/state` end up in a bundle (facets and effects are compared by
identity). Bundling them would break every consumer who also uses CodeMirror directly.

Runtime deps that _are_ bundled: `katex`, `mermaid`, `dompurify`, `node-emoji`,
`style-mod`, `zod`.

### Third-party CSS as a string

`MathPlugin` injects KaTeX's stylesheet into the document, so it needs it as a JavaScript
string. It gets one from a **generated module**, `plugins/katex-css.generated.ts`, produced
by `bun run generate:katex-css` and committed.

The generator exists because the package is consumed through two entry points with
different resolvers — bundled `dist/`, and raw TypeScript via `./src`, which is how
`apps/web` imports it. Any bundler-specific specifier satisfies one and breaks the other:

- a `?raw` suffix (Vite's convention) is what the source used to carry. tsup's
  `esbuildOptions` set `loader[".css"] = "text"`, but that keys off the `.css` extension
  and the specifier ended in `?raw`, so it never applied — `dist/` shipped an unresolvable
  `import katexCss from 'katex/dist/katex.min.css?raw'` and `MathPlugin` could not be
  bundled by anything that does not implement `?raw` (C-025).
- a bare `.css` import would fix `dist/` via that loader, but Next.js resolves it in
  `apps/web` as a stylesheet side effect rather than as text, breaking the playground.

A generated `export const katexCss = "…"` is bundler-agnostic by construction, so the
`esbuildOptions` block is gone and no `.css` import remains in `src/`. Re-run the generator
after bumping `katex`; the KaTeX version is written into the generated file's doc comment
so drift shows up in review. `**/*.generated.ts` is excluded from Biome in
`biome-config/base.json` — generated output is not formatted or linted.

---

## The `draftly/src` export

```json
"./src": { "types": "./src/index.ts", "default": "./src/index.ts" },
"./src/*": "./src/*"
```

`apps/web` imports from `draftly/src`, i.e. **raw TypeScript**, not `dist/`. This means:

- library edits hot-reload in the playground with no rebuild step;
- the playground exercises the real source, so a broken build is caught by type errors
  rather than by stale bundles.

Do not use `draftly/src` from outside this repo — it requires a TS-aware bundler and
bypasses the tested build output.

---

## Code style — Biome

**Biome replaced ESLint + Prettier.** One binary does linting and formatting; there is no
`.prettierrc`, no `eslint.config.js`, and no `@workspace/eslint-config` package any more.

### Config layout

`biome.json` at the root carries `"root": true` — Biome 2.x permits exactly one root config
per repository. Every workspace has a small `biome.json` with `"root": false` that extends
shared presets from `packages/biome-config`:

| Workspace          | Extends                        |
| ------------------ | ------------------------------ |
| `packages/draftly` | `base`                         |
| `packages/ui`      | `base` + `react-internal`      |
| `apps/web`         | `base` + `next-js`             |

`base` is **not** implied by `react-internal` or `next-js`; a workspace lists both.
The root config duplicates `base`'s formatter settings rather than extending it, because a
root config cannot depend on a workspace package that may not be installed yet.

### Formatter settings

Deliberately identical to the previous Prettier config, so the migration did not rewrite
every file: 2-space indent, LF, **lineWidth 120**, double quotes, semicolons always, ES5
trailing commas, always-parenthesised arrow params.

**`lineWidth` is 120**, not 80 — the plugin sources rely on it. Run `bun run check:fix`
before committing rather than hand-wrapping.

### Parser options that are not defaults

- `css.parser.tailwindDirectives: true` — `packages/ui/src/styles/globals.css` uses
  `@source`, which Biome rejects as a parse error otherwise.
- `json.parser.allowComments` / `allowTrailingCommas` — the `tsconfig`-style files in
  `packages/typescript-config` are JSONC.

### Severity policy

`recommended` is on, with deliberate downgrades in `packages/biome-config/base.json`:

| Rule(s)                                                                  | Level | Why |
| ------------------------------------------------------------------------ | ----- | --- |
| All six firing `a11y` rules                                              | warn  | The old ESLint setup had **no** a11y plugin, so every one of these is newly-gained coverage. They are a burn-down backlog, not a reason to fail CI on day one. |
| `noNonNullAssertion`, `useTemplate`, `useSingleVarDeclarator`, `useOptionalChain`, `noUselessConstructor`, `noAssignInExpressions` | warn | Stylistic; ~60 pre-existing occurrences across the plugins. |
| `noArrayIndexKey`, `noDocumentCookie`, `noUnusedPrivateClassMembers`     | warn  | Only fire in the playground and vendored shadcn components. |
| `security/noDangerouslySetInnerHtml`                                     | off   | Draftly's preview pipeline exists to produce HTML strings; the playground renders them. Sanitising is `sanitize()`'s job, not the linter's. |
| `correctness/noInvalidPositionAtImportRule`                              | off   | Tailwind v4 puts `@import "tw-animate-css"` after `@source`, which is CSS-spec-invalid but correct here. |

The previous ESLint config used `eslint-plugin-only-warn`, which downgraded **everything** to
a warning — so `bun run lint` could never fail. Biome's posture is stricter: errors block,
warnings do not. `bun run lint` is currently green with 91 warnings outstanding.

`assist.actions.source.organizeImports` is **off** on purpose. Import order in
`packages/draftly` is load-bearing in places (CodeMirror extension and facet precedence), so
reordering is a reviewed change, not an automatic one.

### Suppressions

Biome's inline suppression is `// biome-ignore lint/<group>/<rule>: <reason>` and the reason
is **mandatory**. It must sit directly above the line the diagnostic anchors to — for a hook
rule like `useExhaustiveDependencies` that is the `useMemo`/`useEffect` call itself, not the
dependency array. A misplaced suppression is reported as `suppressions/unused`.

---

## Release flow

1. Make changes on a branch off `master`.
2. `bun changeset` — pick affected packages and bump level, write a user-facing summary.
   The generated markdown file is committed with the change.
3. Merge to `master`.
4. `bun run version-packages` — consumes changesets, bumps `package.json` versions,
   prepends to `CHANGELOG.md`.
5. `bun run release` — `turbo run build --filter=draftly`, then `changeset publish`.

`access: "public"` and `commit: true` are set, so changesets creates its own commits.
`apps/web` is `private: true` and never published, though it is versioned (`0.0.9`).

### Plugin versions vs package version

A plugin's `version` field is independent of the npm package version — `TablePlugin` is
`2.0.0` after its rewrite while everything else sits at `1.0.0`. Bump a plugin's version
when its behaviour or public shape changes in a way plugin-aware consumers would notice.

---

## Testing

**There is no test suite.** No test runner is configured in any package, and no `test`
task exists in `turbo.json`. Verification today is: type check, lint, and manual
exercise in the playground.

This is the single largest gap in the project's tooling. The pure utility layers —
`editor/utils.ts` theme flattening, and the whole text-utility layer of
`table-plugin.ts` — are trivially unit-testable and would repay the setup immediately.
Tracked in [../tasks/ongoing/](../tasks/ongoing/); discuss with the developer before
introducing a runner, since the choice (`bun test` vs Vitest) is theirs.

---

## Agent skills

`.agents/skills/` holds two vendored skills, pinned by hash in `skills-lock.json`:

| Skill        | Source                    | Read it when                                            |
| ------------ | ------------------------- | ------------------------------------------------------- |
| `codemirror` | `solanabettercall/skills` | Touching decorations, extensions, view plugins, keymaps |
| `turborepo`  | `vercel/turborepo`        | Touching `turbo.json`, workspaces, caching, CI          |

Both carry `references/` subdirectories with substantially more depth than their
`SKILL.md`. Consult them before non-trivial work in their domain.
