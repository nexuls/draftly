# Web Playground

> Last verified: 2026-10-21 · commit `4cf0eed`
> Source: `apps/web/`

The Vite + React single-page app that serves as Draftly's demo site and — most
importantly for agents — **the primary verification surface for library changes**.

---

## Role in the workflow

There is no test suite ([build-and-tooling.md](./build-and-tooling.md)), so the
playground is how a change gets verified. It imports `draftly/src` (raw TypeScript), so:

- library edits hot-reload with no rebuild;
- type errors in the library surface immediately in the app;
- all four surfaces of a change — editor, preview, HTML, CSS — are one click apart.

```bash
bun dev          # Vite on http://localhost:5173
```

### Why Vite, and what it needs

The raw-TypeScript import is the reason for two non-default options in
`vite.config.ts`:

| Option                                     | Why                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `server.fs.allow` widened to the repo root | `draftly/src` resolves into a sibling workspace, outside Vite's default serving root. Without it every raw-TS import 403s in dev. |
| `optimizeDeps.exclude: ["draftly"]`        | Pre-bundling would freeze the library at dev-server start, which defeats the point of importing source. |

**`@workspace/typescript-config/vite.json` deliberately omits `noUnusedLocals` and
`noUnusedParameters`.** Type-checking this app also type-checks the library source it
imports, and those flags turn `packages/draftly`'s own warning backlog (open question 7)
into hard errors here. Unused-symbol linting belongs to each package's Biome run.

---

## Structure

```
apps/web/
├── index.html                  # Entry + the pre-paint theme script
├── vite.config.ts
├── components.json             # shadcn/ui config — scoped to this app
├── public/caret.svg
└── src/
    ├── main.tsx                # Mount
    ├── app.tsx                 # Providers + routes
    ├── styles/
    │   ├── globals.css         # Palette, @theme, base layer, utilities
    │   └── fonts.css           # Self-hosted Inter + JetBrains Mono
    ├── lib/
    │   ├── utils.ts            # cn()
    │   └── codemirror-theme.ts # The app's CodeMirror theme + ThemeEnum mapping
    ├── components/             # Cross-route: theme provider, rails, wordmark
    │   └── ui/                 # shadcn primitives (9, only what is used)
    ├── content/                # Seed markdown documents
    └── routes/
        ├── landing/            # Front page, incl. the live hero editor
        └── playground/         # The editor playground
```

### `routes/playground/`

The route file is composition only. Behaviour lives in hooks and panes:

| File                      | Owns                                                                      |
| ------------------------- | ------------------------------------------------------------------------- |
| `playground-route.tsx`    | Layout, mode selection, wiring                                            |
| `use-documents.ts`        | The document list, `localStorage`, the debounce, the seed-version refresh |
| `use-preview.ts`          | Debounced `preview()` + `generateCSS()`, with stale results discarded     |
| `use-editor-extensions.ts`| `draftly()` composition from the live config                              |
| `plugins.ts`              | `playgroundPlugins`, the config defaults, the active-plugin filter        |
| `panes/`                  | Editor, preview, export, and the shared page sheet                        |
| `inspector/`              | Config switches, the plugin list, the syntax tree                         |

---

## Mechanisms worth knowing

### The four modes are named for the reader, not the call

| Mode     | What it does                                                        |
| -------- | ------------------------------------------------------------------- |
| `write`  | The decorated editor                                                |
| `read`   | `preview()` output, styled by `generateCSS()`                       |
| `source` | The same editor with `disableViewPlugin: true` and the mono face    |
| `export` | The generated HTML and CSS, side by side in tabs                    |

`source` disables the view plugin rather than emptying the plugin list, so the parser and
the keymaps stay and only the decoration layer goes.

### Plugin toggles are derived, not hardcoded

`pluginToggleKeys` is built from `playgroundPlugins`, so a plugin registered in
`createEssentialPlugins()` appears in the inspector automatically. **Do not add a manual
entry** — if a toggle is missing, the plugin was never added to the factory.

### `PREVIEW_WRAPPER_CLASS` is declared once

`preview()` and `generateCSS()` must receive the **same** `wrapperClass` or the output is
completely unstyled, since `generateCSS()` scopes every rule under it. The constant lives
in `use-preview.ts` and both calls read it, so the two cannot drift.

### localStorage keys and versioning

```ts
const STORAGE_KEY = "draftly-playground-contents";
const STORAGE_CURRENT_KEY = "draftly-playground-current";
const STORAGE_VERSION_KEY = "draftly-playground-version";
const VERSION = 3;      // in use-documents.ts
```

> **Bump `VERSION` whenever you edit `src/content/walkthrough.ts` or
> `src/content/what-is-draftly.ts`.** Returning readers have the old text cached; the
> version mismatch is the only thing that refreshes it. Documents the reader wrote are
> preserved across the bump — only the two seeded ids are replaced.

### The syntax tree has to be nudged open

`onNodesChange` is wired up only while the inspector is showing the tree, because
`buildNodes` walks the whole document on every update (T-013). Toggling it **reconfigures**
the extensions rather than remounting the editor, so the view plugin's constructor — the
only place that reports nodes unprompted — never runs again, and its `update()` rebuilds
the tree only on a document, selection or viewport change. The route therefore
re-dispatches the current selection on the next frame; without that the panel stays empty
until the reader types.

### Theming

`ThemeProvider` (`components/theme-provider.tsx`) replaces `next-themes`. Its three states
are `system`, `default-light` and `default-dark`; the latter two are both the `<html>`
class and Draftly's theme-layer names. A script in `index.html` resolves the theme before
first paint and **shares the `draftly-theme` storage key** — changing one without the other
reintroduces the flash.

`draftlyTheme()` always returns `ThemeEnum.DARK` or `ThemeEnum.LIGHT`, never `AUTO`, since
`AUTO` applies the default layer only and does not read the system preference (T-026).

`globals.css`'s `@theme inline` block is what themes the **library**: Draftly's tokens read
`--color-background`, `--color-foreground`, `--color-primary`, `--color-border`,
`--color-muted-foreground` and `--color-destructive` off the host page, and
`--font-jetbrains-mono` is pointed at the app's mono stack in the base layer.

Two faces, both self-hosted from Fontsource as variable fonts (`styles/fonts.css`): **Inter**
for the interface and the prose, **JetBrains Mono** for anything that is source or a
measurement — code, the Source and Export panes, the node tree, the status rail. Inter's
italic is a second import because the variable font carries no slant axis. `--font-serif`
is aimed at the sans stack rather than left at Tailwind's default, so a stray `font-serif`
cannot introduce a third face, and the type scale's body steps are set tighter than a serif
would want because Inter's x-height is doing more of the work at reading size.

### Two plugin sets, never shared

The playground builds `createAllPlugins()` at module scope in `routes/playground/plugins.ts`;
the landing page's hero editor builds `createEssentialPlugins()` in `live-demo.tsx`. They
are separate because plugin instances hold per-view state (C-026) — **and** because the
landing page is on the entry chunk and must not reach Mermaid or KaTeX.

---

## Verifying a library change here

1. `bun dev`, open `/playground`.
2. Load **Walkthrough** — it exercises every plugin. Extend it when adding one.
3. **Write**: correct decoration, and the syntax reveals when the caret enters the construct.
4. **Read**: matching visual output.
5. **Export → preview.html**: semantic, correctly escaped markup.
6. **Export → draftly.css**: your plugin's styles present, scoped under `.draftly-preview`.
7. Toggle your plugin **off** in the inspector and confirm graceful degradation.
8. Toggle **light/dark** and confirm both.

Step 7 catches the common bug where a plugin's decoration is required by another plugin's
assumptions.

### Screenshotting it

There is no browser in the agent environment by default, but Playwright's Chromium is
present on this machine (`~/.cache/ms-playwright`) and Vite serves a plain SPA, so a short
Playwright script driving `localhost:5173` is a workable substitute for eyeballing it. Note
that the segmented rails are visually hidden radio inputs: use `.check({ force: true })`,
not `.click()`, or the label intercepts the pointer event.

---

## Conventions

- UI primitives come from `@/components/ui/*` (shadcn, vendored into this app). Only the
  nine that are actually used are present — add with `bunx shadcn@latest add`, and point
  its `cn` import at `@/lib/utils`.
- `cn()` from `@/lib/utils` for class composition.
- The app is `private: true` and never published.

## Boundary

The playground is a **consumer** of the library, exactly like an external user's app. It
must never be the place a feature lives. If playground code needs a helper that other
consumers would also want, that helper belongs in `packages/draftly/src/lib/`.
