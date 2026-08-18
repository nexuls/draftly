# Architecture Overview

> Last verified: 2026-08-18 · commit `eae4434`
> Breadth-first picture of the system. Follow the links for depth.

---

## 1. The problem

Markdown editing on the web forces an unhappy choice:

- **Raw textarea** — honest to the source, but visually flat and hard to read.
- **WYSIWYG editor** (ProseMirror/Slate style) — pretty, but the document lives in a
  proprietary JSON model. Markdown becomes a lossy import/export format, round-trips
  break, and the user loses direct control of their own syntax.
- **Split-pane preview** — the classic "editor left, preview right" layout. Doubles the
  cognitive load and halves the screen.

There is a further problem downstream: whatever the editor shows, a blog or CMS must
later re-render that markdown as static HTML. Two independent renderers means two
independent styling systems, and the published article never quite looks like the draft.

## 2. The solution

Draftly takes a **decoration-over-source** approach built on CodeMirror 6.

> **The document is always plain markdown text.** Nothing else is ever the source of
> truth. Richness is layered on top as CodeMirror _decorations_ that hide syntax markers
> and style content in place — and they retract the moment the cursor enters the
> construct, revealing the raw markdown underneath.

That single idea yields the whole design:

| Consequence                   | How it falls out                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------- |
| No custom document model      | The Lezer markdown tree _is_ the model; CodeMirror keeps it incrementally parsed |
| No lossy round-trip           | `view.state.doc.toString()` is the markdown, byte for byte                       |
| Editing stays user-controlled | Type `**` and it works; put the cursor in it and you see `**`                    |
| Preview parity is achievable  | Both surfaces are driven by the _same_ plugin objects (see below)                |

And the second key idea:

> **A plugin is a single object that owns a markdown feature end to end** — its parser
> extension, its editor decorations, its keymap, its theme, _and_ its static HTML
> renderer. One class, one feature, both surfaces.

This is what makes editor/preview parity structural rather than aspirational. When
`HeadingPlugin` changes the class name it applies to an `<h2>`, both the live editor
decoration and the generated static HTML change together, because they read from the
same `headingMarkDecorations` map in the same file.

---

## 3. System shape

```
                        ┌───────────────────────────────┐
                        │      DraftlyPlugin[]          │
                        │  (one object per md feature)  │
                        │                               │
                        │  getMarkdownConfig()  parser  │
                        │  getExtensions()      CM ext  │
                        │  getKeymap()          keys    │
                        │  buildDecorations()   editor  │
                        │  theme                styles  │
                        │  renderToHTML()       static  │
                        └───────┬───────────────┬───────┘
                                │               │
              ┌─────────────────┘               └──────────────────┐
              ▼                                                    ▼
   ══════ EDITOR SURFACE ══════                        ══════ PREVIEW SURFACE ══════

   draftly(config): Extension[]                        preview(md, config): Promise<string>
              │                                                    │
              ▼                                                    ▼
   ┌──────────────────────────┐                        ┌──────────────────────────┐
   │ markdown() language      │  ← same parser config →│ markdown() language      │
   │  + plugin MarkdownConfig │                        │  + plugin MarkdownConfig │
   └───────────┬──────────────┘                        └───────────┬──────────────┘
               │ incremental Lezer tree                            │ one-shot parse
               ▼                                                   ▼
   ┌──────────────────────────┐                        ┌──────────────────────────┐
   │ draftlyViewPlugin        │                        │ PreviewRenderer          │
   │  sort by priority        │                        │  walk tree, dispatch on  │
   │  → buildDecorations(ctx) │                        │    requiredNodes         │
   │  → RangeSetBuilder       │                        │  → renderToHTML()        │
   └───────────┬──────────────┘                        └───────────┬──────────────┘
               ▼                                                   ▼
        DecorationSet on screen                            HTML string
               +                                                   +
        EditorView.theme(plugin.theme)                      generateCSS(plugins)
                                                            (same theme objects,
                                                             re-scoped selectors)
```

The symmetry is the point. Read the two columns as one system with two output devices.

---

## 4. The five modules

| Module     | Responsibility                                                                               | Depth doc                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `editor/`  | Compose the CodeMirror extension bundle; define the plugin contract; run the decoration loop | [editor-core.md](./editor-core.md), [plugin-system.md](./plugin-system.md)       |
| `plugins/` | 14 built-in features, each a self-contained subclass                                         | [plugins-catalog.md](./plugins-catalog.md), [plugin-table.md](./plugin-table.md) |
| `preview/` | Walk a parsed tree and emit semantic HTML + matching CSS                                     | [preview-pipeline.md](./preview-pipeline.md)                                     |
| `lib/`     | Small standalone CodeMirror helpers with no plugin coupling                                  | —                                                                                |
| `theming`  | `createTheme()` → nested style objects → `EditorView.theme` _or_ scoped CSS                  | [theming.md](./theming.md)                                                       |

Dependency direction is strictly one-way:

```
lib  ←  editor  ←  plugins  →  preview  →  editor
                      ▲                      │
                      └──────────────────────┘
                   (preview consumes plugin objects;
                    plugins import PreviewRenderer only
                    in table-plugin for nested rendering)
```

`editor/` never imports `plugins/`. Plugins are always injected by the caller via
`DraftlyConfig.plugins` or `PreviewConfig.plugins`. This is what keeps the library
tree-shakeable and lets consumers ship only the features they use.

---

## 5. Request lifecycle — editing

1. Consumer calls `draftly({ plugins: createEssentialPlugins(), theme, ... })`.
2. For each plugin: `onRegister(ctx)`, then collect `getExtensions()`, `getKeymap()`,
   `theme`, `getMarkdownConfig()`.
3. Markdown configs are merged into a single `markdown()` language support instance.
4. Extensions are composed in precedence order and handed back to CodeMirror.
5. `draftlyViewPlugin` instantiates: builds the initial `DecorationSet`, fires
   `onViewReady` on every plugin, and emits the initial AST via `onNodesChange`.
6. On every update where `docChanged || selectionSet || viewportChanged`, decorations
   are rebuilt: plugins are sorted by `decorationPriority` ascending, each pushes
   `Range<Decoration>` into a shared array, the array is sorted by position, and a
   `RangeSetBuilder` produces the final set.

## 6. Request lifecycle — preview

1. Consumer calls `await preview(markdown, { plugins, theme, ... })`.
2. `PreviewRenderer` builds a `Map<nodeName, DraftlyPlugin[]>` from every plugin's
   `requiredNodes`, giving O(1) dispatch during the walk.
3. The document is parsed once with the _same_ `markdown()` configuration the editor uses.
4. The tree is walked depth-first. For each node: try plugin renderers (first non-`null`
   wins), then `defaultRenderers`, then recurse into children, then fall back to raw text.
5. Text in the gaps _between_ child nodes is HTML-escaped and preserved — this is what
   keeps whitespace and stray characters faithful.
6. `generateCSS()` runs the plugins' theme objects through `StyleModule` with a
   `.${wrapperClass}` prefix so the static output matches the editor visually.

---

## 7. Load-bearing invariants

Violating any of these breaks the design, not just a test. Flag rather than "fix" if you
find code that contradicts one.

1. **The doc is the model.** No shadow state. Any feature that needs derived data must
   recompute it from the syntax tree.
2. **Decorations retract under the cursor.** Every hiding decoration must be guarded by
   `ctx.selectionOverlapsRange(...)` or `ctx.cursorInRange(...)`.
3. **`replace` decorations never span a newline.** Clamp to `line.to` — CodeMirror throws
   otherwise. See `heading-plugin.ts:104` for the canonical clamp.
4. **Decorations must be position-sorted before `RangeSetBuilder`.** Handled centrally in
   `view-plugin.ts`; plugins may push in any order.
5. **`requiredNodes` is the preview dispatch key.** A plugin with a `renderToHTML()` but
   an empty `requiredNodes` is silently dead in preview.
6. **One feature, one plugin file.** Cross-plugin coupling is the thing this architecture
   exists to prevent.
7. **Parser config must be identical across surfaces.** `renderer.ts` deliberately builds
   its parser through `@codemirror/lang-markdown` rather than raw `@lezer/markdown` so
   the two trees are the same shape.

---

## 8. Known tension points

Tracked in detail in [../tasks/index.md](../tasks/index.md) and [../memory.md](../memory.md).

- **Decoration errors are swallowed.** `view-plugin.ts:57` catches and discards all
  exceptions from `buildDecorations`, because partial Lezer trees legitimately throw
  mid-parse. The cost is that real plugin bugs are invisible. Needs a dev-mode escape hatch.
- **Server-side sanitization is a no-op.** `context.ts` returns HTML unchanged outside a
  browser because DOMPurify needs a DOM. Documented, but the default reads as safe when
  it is not.
- **`table-plugin.ts` (1759 LOC) and `code-plugin.ts` (1368 LOC)** are far above the
  ~500 LOC ceiling every other plugin respects. Both are candidates for internal
  decomposition into a directory.
- **README drift.** The public README documents a `themeStyle` config option that
  `DraftlyConfig` does not have, and shows `preview()` used synchronously when it returns
  a `Promise`. See [../memory.md](../memory.md#open-questions-for-the-developer).
