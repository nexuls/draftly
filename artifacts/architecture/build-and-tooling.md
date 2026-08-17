# Build & Tooling

> Last verified: 2026-08-18 · commit `eae4434`

---

## Toolchain

| Concern         | Tool                   | Notes                                                |
| --------------- | ---------------------- | ---------------------------------------------------- |
| Package manager | **Bun 1.3.5**          | Pinned via `packageManager`; `bun.lock` is committed |
| Task runner     | **Turborepo 2.6.3**    | `turbo.json` at root                                 |
| Library bundler | **tsup 8.5**           | esbuild-based; emits ESM + CJS + `.d.ts`             |
| App framework   | **Next.js 16**         | App Router, Turbopack dev                            |
| Language        | **TypeScript 5.7/5.9** | Root pins 5.7.3; `packages/draftly` uses ^5.9.3      |
| Formatting      | **Prettier 3.7**       | `.prettierrc` at root                                |
| Linting         | **ESLint 9**           | Flat config per package                              |
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
bun run lint                # turbo run lint
bun run format              # prettier --write "**/*.{ts,tsx,md}"

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
| `check-types` | `^check-types` | —                                   | yes                |
| `dev`         | —              | —                                   | **no**, persistent |

`build` includes `.env*` in its `inputs` so env changes bust the cache.

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

Five entries, one per subpath export. `splitting: true` plus `treeshake: true` is what
lets a consumer importing only `draftly/preview` avoid pulling in mermaid and KaTeX.

### Externals

Every `@codemirror/*` and `@lezer/*` package is marked external and declared as a
**peer dependency**. This is deliberate and important: CodeMirror breaks badly if two
copies of `@codemirror/state` end up in a bundle (facets and effects are compared by
identity). Bundling them would break every consumer who also uses CodeMirror directly.

Runtime deps that _are_ bundled: `katex`, `mermaid`, `dompurify`, `node-emoji`,
`style-mod`, `zod`.

### CSS-as-text loader

```ts
options.loader = { ...options.loader, ".css": "text" };
```

Lets plugins `import` a CSS file and receive its contents as a string (used for injecting
third-party stylesheets like KaTeX's into generated preview CSS).

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

## Code style

`.prettierrc`, applied to all `.ts`/`.tsx`/`.md`:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 120,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

**`printWidth` is 120**, not 80 — the plugin sources rely on it. Run `bun run format`
before committing rather than hand-wrapping.

### ESLint

- Root `.eslintrc.js` covers root-level files only (`ignorePatterns: ["apps/**", "packages/**"]`).
- Each package has its own flat `eslint.config.js` extending `@workspace/eslint-config`
  (`base.js`, `next.js`, or `react-internal.js`).
- `packages/draftly` and `packages/ui` keep a separate `tsconfig.lint.json` for
  type-aware rules without slowing the main build.

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
