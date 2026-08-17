# Repository Map

> Last verified: 2026-08-18 · commit `eae4434`
> Update this file whenever a directory is added, removed, or its purpose changes.

## At a glance

**Draftly** is a Turborepo monorepo (Bun workspaces) that publishes one public npm
package — `draftly` — plus a Next.js documentation/playground app and shared internal
tooling packages.

```
draftly/
├── apps/
│   └── web/                  # Next.js 16 playground + docs site (private)
├── packages/
│   ├── draftly/              # ⭐ The published library (npm: `draftly`)
│   ├── ui/                   # @workspace/ui — shadcn/ui component library (private)
│   ├── eslint-config/        # @workspace/eslint-config (private)
│   └── typescript-config/    # @workspace/typescript-config (private)
├── artifacts/                # ⭐ Agent knowledge base (this directory)
├── .agents/skills/           # Vendored agent skills (codemirror, turborepo)
├── .changeset/               # Changesets release configuration
├── AGENTS.md                 # Agent instruction set (CLAUDE.md is a symlink to it)
├── turbo.json                # Task pipeline
└── package.json              # Workspace root
```

---

## `packages/draftly` — the library

The only publishable package. Version `2.0.0`. Built with `tsup` into ESM + CJS + `.d.ts`.

```
packages/draftly/
├── src/
│   ├── index.ts                    # Barrel: re-exports editor + plugins + preview + lib
│   ├── editor/                     # Core editor runtime
│   │   ├── index.ts                # Barrel for `draftly/editor`
│   │   ├── draftly.ts              # draftly() factory — composes the extension bundle
│   │   ├── plugin.ts               # DraftlyPlugin / DecorationPlugin / SyntaxPlugin base classes
│   │   ├── view-plugin.ts          # CodeMirror ViewPlugin, facets, decoration orchestration
│   │   ├── theme.ts                # Base editor theme + markdown highlight reset
│   │   └── utils.ts                # createTheme, flattenThemeStyles, selection helpers
│   ├── plugins/                    # Built-in feature plugins (one file per feature)
│   │   ├── index.ts                # Barrel + `essentialPlugins` / `allPlugins` collections
│   │   ├── paragraph-plugin.ts
│   │   ├── heading-plugin.ts
│   │   ├── inline-plugin.ts
│   │   ├── link-plugin.ts
│   │   ├── list-plugin.ts
│   │   ├── table-plugin.ts         # Largest plugin (~1.7k LOC) — see architecture/plugin-table.md
│   │   ├── html-plugin.ts
│   │   ├── image-plugin.ts
│   │   ├── math-plugin.ts          # KaTeX
│   │   ├── mermaid-plugin.ts       # Mermaid diagrams
│   │   ├── code-plugin.ts          # Fenced/inline code (~1.4k LOC)
│   │   ├── code-plugin.theme.ts    # Code plugin styles, split out for readability
│   │   ├── quote-plugin.ts
│   │   ├── hr-plugin.ts
│   │   └── emoji-plugin.ts
│   ├── preview/                    # Static markdown → HTML renderer
│   │   ├── index.ts                # Barrel for `draftly/preview`
│   │   ├── preview.ts              # preview() entry point
│   │   ├── renderer.ts             # PreviewRenderer — tree walk + plugin dispatch
│   │   ├── context.ts              # PreviewContext factory (sliceDoc / sanitize / renderChildren)
│   │   ├── css-generator.ts        # generateCSS() — collects plugin styles
│   │   ├── syntax-theme.ts         # Extracts `tok-*` CSS from CodeMirror HighlightStyles
│   │   ├── default-renderers.ts    # Fallback node renderers + escapeHtml
│   │   └── types.ts                # PreviewConfig, PreviewContext, GenerateCSSConfig, …
│   └── lib/                        # Standalone, framework-agnostic helpers
│       ├── index.ts                # Barrel for `draftly/lib`
│       └── input-handler.ts        # createWrapSelectionInputHandler
├── tsup.config.ts                  # 5 entry points, CM packages marked external
├── package.json                    # Subpath exports: ., /editor, /plugins, /preview, /lib, /src
└── README.md                       # Public-facing docs (npm landing page)
```

### Subpath export map

| Import specifier  | Source entry           | Contents                                      |
| ----------------- | ---------------------- | --------------------------------------------- |
| `draftly`         | `src/index.ts`         | Everything (backwards compatible barrel)      |
| `draftly/editor`  | `src/editor/index.ts`  | `draftly()`, plugin base classes, theme utils |
| `draftly/plugins` | `src/plugins/index.ts` | All built-in plugins + collections            |
| `draftly/preview` | `src/preview/index.ts` | `preview()`, `generateCSS()`, renderer        |
| `draftly/lib`     | `src/lib/index.ts`     | Standalone CodeMirror helpers                 |
| `draftly/src`     | `src/index.ts` (raw)   | Untranspiled TS — used by `apps/web` for HMR  |

---

## `apps/web` — playground & docs

Next.js 16 (App Router, Turbopack) app. Consumes the library through `draftly/src`
so library edits hot-reload without a rebuild.

```
apps/web/
├── app/
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Landing page
│   ├── data/md/                    # Seed markdown documents
│   │   ├── what-id-draftly.ts
│   │   └── walkthrough.ts
│   └── playground/                 # The interactive editor playground
│       ├── page.tsx                # State, localStorage persistence, editor+preview panes
│       ├── header.tsx / footer.tsx / sidebar.tsx
│       ├── devbar.tsx              # Live toggles for every DraftlyConfig / plugin flag
│       ├── create-content-dialog.tsx
│       └── types.d.ts
├── components/providers.tsx        # next-themes provider
└── hooks/use-mobile.ts
```

---

## Shared internal packages

| Package                      | Name                           | Purpose                                                  |
| ---------------------------- | ------------------------------ | -------------------------------------------------------- |
| `packages/ui`                | `@workspace/ui`                | ~60 shadcn/ui components, Tailwind v4, consumed by `web` |
| `packages/eslint-config`     | `@workspace/eslint-config`     | `base.js`, `next.js`, `react-internal.js` presets        |
| `packages/typescript-config` | `@workspace/typescript-config` | `base.json`, `nextjs.json`, `react-library.json`         |

---

## Root-level files

| File                  | Role                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `turbo.json`          | Tasks: `build` (`^build`, outputs `dist/**`, `.next/**`), `lint`, `check-types`, `dev` (persistent, uncached) |
| `package.json`        | Bun 1.3.5 as `packageManager`; Node >= 20; scripts `build`/`dev`/`lint`/`format`/`changeset`/`release`        |
| `.changeset/`         | Release flow — `baseBranch: master`, `access: public`, auto-commit on                                         |
| `.prettierrc`         | 2 spaces, double quotes, semicolons, **printWidth 120**, `trailingComma: es5`, LF                             |
| `.eslintrc.js`        | Root-only config; `apps/**` and `packages/**` use their own flat configs                                      |
| `pnpm-workspace.yaml` | Present for tooling compatibility; **Bun is the actual package manager**                                      |
| `skills-lock.json`    | Pins the vendored `.agents/skills` (codemirror, turborepo) by hash                                            |
| `CONTRIBUTING.md`     | Human contributor guide — keep in sync with `AGENTS.md`                                                       |

---

## Where to make a change

| Goal                                     | Start here                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Add a markdown feature                   | New file in `packages/draftly/src/plugins/` + register in `plugins/index.ts` |
| Change how the editor bundle is composed | `packages/draftly/src/editor/draftly.ts`                                     |
| Change decoration ordering / lifecycle   | `packages/draftly/src/editor/view-plugin.ts`                                 |
| Add a plugin capability (new hook)       | `packages/draftly/src/editor/plugin.ts`                                      |
| Change static HTML output                | `plugins/*.ts` → `renderToHTML()`, or `preview/renderer.ts` for the walk     |
| Change generated preview CSS             | Plugin `theme` getter, or `preview/css-generator.ts`                         |
| Try something interactively              | `apps/web/app/playground/`                                                   |
| Ship a release                           | `bun changeset` → `bun run version-packages` → `bun run release`             |
