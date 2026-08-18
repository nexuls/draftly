# Plugin Catalog

> Last verified: 2026-08-18 · commit `eae4434`
> Source: `packages/draftly/src/plugins/`
> For the contract these all implement, see [plugin-system.md](./plugin-system.md).

14 built-in plugins. All are exported individually from `draftly/plugins` and bundled
via `createEssentialPlugins()` (`draftly/plugins` — the 11 light plugins) and
`createAllPlugins()` (`draftly/plugins/all` — those plus `MathPlugin`, `MermaidPlugin` and
`EmojiPlugin`, which sit behind their own entry points because of their dependencies). The
`essentialPlugins` / `allPlugins` arrays are the deprecated shared-singleton form of the
same two sets.

---

## Catalog

| Plugin      | Ver   | Prio | LOC  | Base class         | Owns                                            |
| ----------- | ----- | ---- | ---- | ------------------ | ----------------------------------------------- |
| `paragraph` | 1.0.0 | 100  | 38   | `DraftlyPlugin`    | `Paragraph` — render-only, no decorations       |
| `heading`   | 1.0.0 | 10   | 197  | `DecorationPlugin` | `ATXHeading1–6`, `HeaderMark`                   |
| `quote`     | 1.0.0 | 10   | 146  | `DecorationPlugin` | `Blockquote`, `QuoteMark`                       |
| `hr`        | 1.0.0 | 10   | 102  | `DecorationPlugin` | `HorizontalRule`                                |
| `inline`    | 1.0.0 | 20   | 305  | `DecorationPlugin` | Bold, italic, strikethrough, highlight          |
| `list`      | 1.0.0 | 20   | 492  | `DecorationPlugin` | Bullet/ordered lists, task lists                |
| `table`     | 2.0.0 | 20   | 1759 | `DecorationPlugin` | GFM tables — full interactive editing           |
| `emoji`     | 1.0.0 | 20   | 140  | `DecorationPlugin` | `:shortcode:` → emoji (custom parser node)      |
| `link`      | 1.0.0 | 22   | 509  | `DecorationPlugin` | `Link`                                          |
| `code`      | 1.0.0 | 25   | 1368 | `DecorationPlugin` | `InlineCode`, `FencedCode` + diff view          |
| `image`     | 1.0.0 | 25   | 447  | `DecorationPlugin` | `Image` — inline rendering, captions            |
| `math`      | 1.0.0 | 25   | 526  | `DecorationPlugin` | `$…$` / `$$…$$` via KaTeX (custom parser nodes) |
| `mermaid`   | 1.0.0 | 25   | 500  | `DecorationPlugin` | ` ```mermaid ` diagram blocks                   |
| `html`      | 1.0.0 | 30   | 419  | `DecorationPlugin` | Raw HTML: blocks, tags, comments                |

`code-plugin.theme.ts` (426 LOC) holds `CodePlugin`'s styles separately — the precedent
for splitting a theme out when it dominates the plugin file.

---

## Grouping by what they do

### Structural / block (priority 10)

`heading`, `quote`, `hr`. Apply `Decoration.line()` to whole lines and hide leading
markers (`#`, `>`, `---`) when the selection is elsewhere. Simplest plugins in the
codebase — **read `heading-plugin.ts` first** when learning the system.

### Inline formatting (priority 20)

`inline` owns bold/italic/strikethrough/highlight. Notable for contributing all three
kinds of extension at once:

- `getMarkdownConfig()` — adds `==highlight==` to the parser
- `getKeymap()` — `Mod-b` / `Mod-i` etc. via `toggleMarkdownStyle()`
- `getExtensions()` — `createWrapSelectionInputHandler` from `lib/`, so typing `*` with
  text selected wraps it (added for issue #1)

### Block structure (priority 20)

`list` handles nesting, bullet substitution, and task checkboxes. `table` is the outlier
— see [plugin-table.md](./plugin-table.md).

### Widget replacements (priority 22–25)

`link`, `code`, `image`, `math`, `mermaid`. All replace source ranges with rendered
`WidgetType` output. Shared concerns:

- Widgets must implement `eq()` correctly, or CodeMirror re-creates DOM on every update.
  `eq()` returning `false` is a deliberate "always rebuild" (used by
  `TableControlsWidget` to keep handler closures fresh) — never an accident.
- `ignoreEvent()` decides whether the editor sees events inside the widget. Interactive
  widgets (copy buttons, table controls) return `false`.
- `math` and `mermaid` render asynchronously; both must handle the widget being destroyed
  before their render resolves.

### Escape hatch (priority 30)

`html` runs last so it sees the fully-decorated document before deciding how to treat raw
HTML. It is also the main consumer of `ctx.sanitize()` — and therefore the plugin most
affected by the server-side sanitization gap documented in
[preview-pipeline.md](./preview-pipeline.md).

Until C-012 it declared **no `requiredNodes` and no `renderToHTML`**, so it was silently
absent from preview on the one node type where absence is dangerous — HTML nodes fell
through to the renderer's unescaped leaf fallback. It now claims `HTMLBlock`, `HTMLTag`,
`Comment` and `CommentBlock`.

Its `HTMLTag` path is worth knowing about: DOMPurify balances the fragment it is handed,
so a lone `<b>` becomes `<b></b>` and a lone `</b>` becomes `""`. The plugin therefore
sanitizes inside a balanced probe and reads the verdict off the result, re-emitting the
tag in its original role. Do not "simplify" it to a direct `ctx.sanitize()` call.

---

## Plugins that extend the parser

Most plugins decorate nodes Lezer already produces. These three add new node types via
`getMarkdownConfig()`:

| Plugin    | New nodes                                  | Syntax         |
| --------- | ------------------------------------------ | -------------- |
| `inline`  | highlight mark                             | `==text==`     |
| `math`    | `InlineMath`, `MathBlock`, + their marks   | `$x$`, `$$x$$` |
| `mermaid` | `MermaidBlock`, `MermaidBlockMark`         | ` ```mermaid ` |
| `emoji`   | `Emoji`, `EmojiMark`                       | `:smile:`      |
| `table`   | re-exports `@lezer/markdown`'s GFM `Table` | `\| a \| b \|` |

Parser extensions are the one thing that must be identical across editor and preview —
which the contract guarantees by having both call `getMarkdownConfig()`.

---

## Heavy external dependencies

| Plugin    | Dependency   | Weight     | Notes                                      |
| --------- | ------------ | ---------- | ------------------------------------------ |
| `math`    | `katex`      | large      | Injects KaTeX's CSS itself (`katex-css.generated.ts`); the host must still serve KaTeX's **fonts** — see memory Q17 |
| `mermaid` | `mermaid`    | very large | Async render; dominates bundle size        |
| `html`    | `dompurify`  | medium     | Browser-only effectiveness                 |
| `emoji`   | `node-emoji` | small      |                                            |

These are why the three sit behind their own entry points rather than in the barrel. A consumer who does not need
diagrams should not import `MermaidPlugin` at all — the subpath exports and `tsup`'s
`splitting: true` make that a real bundle saving.

---

## Registering a new plugin

1. Create `packages/draftly/src/plugins/<feature>-plugin.ts`.
2. Extend `DecorationPlugin` (or `DraftlyPlugin` if render-only).
3. Set `name`, `version`, `decorationPriority`, `requiredNodes`.
4. Add the named export **and** the `createEssentialPlugins()` entry in `plugins/index.ts` —
   unless the plugin pulls a heavy dependency, in which case it gets its own entry point
   and an entry in `plugins/all.ts` instead.
5. Add a row to the catalog table above.
6. Verify both surfaces in the playground: the editor pane _and_ the rendered preview.

Split into a directory (`plugins/<feature>/`) rather than growing past ~500 LOC.
