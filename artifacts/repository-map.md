# Repository Map

> Last verified: 2026-10-21 · commit `4cf0eed`
> Update this file whenever a directory is added, removed, or its purpose changes.

## At a glance

**Draftly** is a Turborepo monorepo (Bun workspaces) that publishes one public npm
package — `draftly` — plus a Vite + React demo/playground app and shared internal
tooling packages.

```
draftly/
├── apps/
│   └── web/                  # Vite + React playground + landing page (private)
├── packages/
│   ├── draftly/              # ⭐ The published library (npm: `draftly`)
│   ├── biome-config/         # @workspace/biome-config — shared Biome presets (private)
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
│   │   ├── index.ts                # Light-plugin barrel + `createEssentialPlugins()`
│   │   ├── all.ts                  # Entry point: `createAllPlugins()` — pulls everything
│   │   ├── mermaid.ts              # Entry point: MermaidPlugin (opt-in)
│   │   ├── math.ts                 # Entry point: MathPlugin (opt-in)
│   │   ├── emoji.ts                # Entry point: EmojiPlugin (opt-in)
│   │   ├── paragraph-plugin.ts
│   │   ├── heading-plugin.ts
│   │   ├── inline-plugin.ts
│   │   ├── link-plugin.ts
│   │   ├── list-plugin.ts
│   │   ├── table-plugin.ts         # Largest plugin (~1.7k LOC) — see architecture/plugin-table.md
│   │   ├── html-plugin.ts
│   │   ├── image-plugin.ts
│   │   ├── math-plugin.ts          # KaTeX
│   │   ├── katex-css.generated.ts  # KaTeX stylesheet as a string — generated, do not edit
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
├── scripts/
│   ├── theme-snapshot.ts           # Dumps resolved preview CSS per theme, for style diffs
│   └── generate-katex-css.ts       # Emits plugins/katex-css.generated.ts from node_modules
├── tsup.config.ts                  # 5 entry points, CM packages marked external
├── package.json                    # Subpath exports: ., /editor, /plugins, /preview, /lib, /src
└── README.md                       # Public-facing docs (npm landing page)
```

### Subpath export map

| Import specifier  | Source entry           | Contents                                      |
| ----------------- | ---------------------- | --------------------------------------------- |
| `draftly`                 | `src/index.ts`           | Editor, preview, lib, and the **light** plugins |
| `draftly/editor`          | `src/editor/index.ts`    | `draftly()`, plugin base classes, theme utils |
| `draftly/plugins`         | `src/plugins/index.ts`   | The 11 light plugins + `createEssentialPlugins()` |
| `draftly/plugins/mermaid` | `src/plugins/mermaid.ts` | `MermaidPlugin` — opt-in, pulls `mermaid` (5.3 MB) |
| `draftly/plugins/math`    | `src/plugins/math.ts`    | `MathPlugin` — opt-in, pulls `katex` (475 KB)  |
| `draftly/plugins/emoji`   | `src/plugins/emoji.ts`   | `EmojiPlugin` — opt-in, pulls `node-emoji` (312 KB) |
| `draftly/plugins/all`     | `src/plugins/all.ts`     | `createAllPlugins()` — the essential set plus all three |
| `draftly/preview`         | `src/preview/index.ts`   | `preview()`, `generateCSS()`, renderer        |
| `draftly/lib`             | `src/lib/index.ts`       | Standalone CodeMirror helpers                 |
| `draftly/src`             | `src/index.ts` (raw)     | Untranspiled TS — used by `apps/web` for HMR  |
| `draftly/src/*`           | `src/*.ts` (raw)         | Deep raw import, e.g. `draftly/src/plugins/all` |

The four plugin entry points exist so that the heavy third-party dependencies land in their
own chunks. See [`architecture/build-and-tooling.md`](./architecture/build-and-tooling.md#plugin-entry-points).

---

## `apps/web` — playground & landing page

Vite 8 + React 19 single-page app on `react-router`. Consumes the library through
`draftly/src` so library edits hot-reload without a rebuild. shadcn/ui is vendored into
this app rather than shared.

```
apps/web/
├── index.html                      # Entry + pre-paint theme script
├── vite.config.ts                  # fs.allow + optimizeDeps.exclude for draftly/src
├── components.json                 # shadcn config, scoped to this app
└── src/
    ├── main.tsx / app.tsx          # Mount, providers, routes
    ├── styles/
    │   ├── globals.css             # Palette, @theme (also themes the library), base layer
    │   └── fonts.css               # Self-hosted Inter + JetBrains Mono
    ├── lib/
    │   ├── utils.ts                # cn()
    │   └── codemirror-theme.ts     # App CodeMirror theme + ThemeEnum mapping
    ├── components/                 # Theme provider, segmented rail, wordmark, copy button
    │   └── ui/                     # 9 vendored shadcn primitives
    ├── content/                    # Seed markdown documents
    └── routes/
        ├── landing/                # Front page + the live hero editor
        ├── playground/             # Panes, inspector, hooks — see architecture/web-playground.md
        └── not-found-route.tsx
```

---

## Shared internal packages

| Package                      | Name                           | Purpose                                                  |
| ---------------------------- | ------------------------------ | -------------------------------------------------------- |
| `packages/biome-config`      | `@workspace/biome-config`      | `base.json`, `react-internal.json` presets               |
| `packages/typescript-config` | `@workspace/typescript-config` | `base.json`, `vite.json`, `react-library.json`           |

---

## Root-level files

| File                  | Role                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `turbo.json`          | Tasks: `build` (`^build`, outputs `dist/**`), `lint`, `lint:fix`, `format`, `check-types`, `dev`              |
| `package.json`        | Bun 1.3.5 as `packageManager`; Node >= 20; scripts `build`/`dev`/`lint`/`format`/`check`/`changeset`/`release` |
| `.changeset/`         | Release flow — `baseBranch: master`, `access: public`, auto-commit on                                         |
| `biome.json`          | **`root: true`** — lint + format. 2 spaces, double quotes, semicolons, **lineWidth 120**, ES5 trailing commas, LF |
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
| Try something interactively              | `apps/web/src/routes/playground/`                                            |
| Ship a release                           | `bun changeset` → `bun run version-packages` → `bun run release`             |
