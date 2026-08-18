# Editor Core

> Last verified: 2026-08-18 · commit `eae4434`
> Covers `packages/draftly/src/editor/` except the plugin contract itself
> (see [plugin-system.md](./plugin-system.md)) and theming (see [theming.md](./theming.md)).

---

## Files

| File             | LOC | Role                                                              |
| ---------------- | --- | ----------------------------------------------------------------- |
| `draftly.ts`     | 202 | `draftly()` factory — the public entry point; composes extensions |
| `view-plugin.ts` | 189 | `ViewPlugin` class, facets, decoration build loop, AST emission   |
| `theme.ts`       | 63  | Base editor theme + markdown syntax-highlight reset               |
| `utils.ts`       | 176 | Theme construction, selection predicates, style toggling          |
| `plugin.ts`      | 277 | Plugin base classes — documented separately                       |

---

## `draftly()` — the composition root

```ts
export function draftly(config: DraftlyConfig = {}): Extension[];
```

This is the only function a consumer must call. It is a **pure factory**: it reads
config, walks the plugin list once, and returns an `Extension[]`. It holds no state and
touches no DOM.

### `DraftlyConfig`

| Option                | Type                             | Default     | Notes                                             |
| --------------------- | -------------------------------- | ----------- | ------------------------------------------------- |
| `theme`               | `ThemeEnum`                      | `AUTO`      | Resolved at composition time, not reactively      |
| `baseStyles`          | `boolean`                        | `true`      | Gates _both_ `draftlyBaseTheme` and plugin themes |
| `plugins`             | `DraftlyPlugin[]`                | `[]`        | Injected — the core never imports plugins         |
| `markdown`            | `MarkdownConfig[]`               | `[]`        | Appended _after_ plugin parser extensions         |
| `extensions`          | `Extension[]`                    | `[]`        | Escape hatch, applied last (lowest precedence)    |
| `keymap`              | `KeyBinding[]`                   | `[]`        | Escape hatch                                      |
| `disableViewPlugin`   | `boolean`                        | `false`     | Raw-markdown mode — see the gate below            |
| `defaultKeybindings`  | `boolean`                        | `true`      | `@codemirror/commands` `defaultKeymap`            |
| `history`             | `boolean`                        | `true`      | Undo/redo + `historyKeymap`                       |
| `indentWithTab`       | `boolean`                        | `true`      | Also enables `indentOnInput()`                    |
| `highlightActiveLine` | `boolean`                        | `true`      | **Only applied when `disableViewPlugin` is true** |
| `lineWrapping`        | `boolean`                        | `true`      | Always on in rich mode regardless of this flag    |
| `onNodesChange`       | `(nodes: DraftlyNode[]) => void` | `undefined` | Fired on every rebuild — see cost warning below   |

### The `disableViewPlugin` gate

`disableViewPlugin: true` degrades Draftly to a plain, well-configured CodeMirror
markdown editor. Concretely it skips:

- the entire plugin processing loop (`draftly.ts:117`) — so **no** `onRegister`, **no**
  `getExtensions()`, **no** `getKeymap()`, **no** plugin themes, **no** parser extensions;
- the `draftlyViewPlugin` and the markdown highlight reset.

And it _enables_ `highlightActiveLine()`, which is suppressed in rich mode because active-line
backgrounds fight with block widgets.

> **Historical note:** plugin extensions used to be registered even in disabled mode,
> which leaked keymaps and widgets into raw mode. Fixed in `ed6ea7e`. The loop is now
> inside the `if (!disableViewPlugin)` block — keep it there.

### Precedence order

Order in the returned array matters; CodeMirror resolves conflicts by precedence.

```ts
[
  Prec.high(markdownSupport), // 1. language + parser
  Prec.high(keymap.of(markdownKeymap)), // 2. markdown-aware keys
  draftlyExtensions, // 3. view plugin, Prec.highest(reset), lineWrapping
  baseExtensions, // 4. history, defaults, indent
  pluginExtensions, // 5. plugin-contributed extensions + themes
  pluginKeymaps, // 6. plugin keybindings (flattened, single keymap.of)
  configKeymap, // 7. consumer keybindings
  extensions, // 8. consumer extensions
];
```

Two deliberate choices:

- `Prec.highest(markdownResetExtension)` beats any user-supplied CodeMirror theme, so a
  theme like `githubDark` cannot re-colour `#` markers that Draftly wants neutral.
- All plugin keymaps are flattened into **one** `keymap.of()` call, so plugin
  registration order decides which binding wins a conflict — not extension nesting.

---

## `view-plugin.ts` — the decoration loop

### Facets

Three facets carry composition-time values into the `ViewPlugin` instance:

| Facet                       | Combine strategy                   | Carries            |
| --------------------------- | ---------------------------------- | ------------------ |
| `DraftlyPluginsFacet`       | `values.flat()`                    | The plugin array   |
| `draftlyOnNodesChangeFacet` | first non-`undefined`              | The AST callback   |
| `draftlyThemeFacet`         | first non-`undefined`, else `AUTO` | The resolved theme |

Facets (rather than closure capture) are used so plugins and consumers can in principle
reconfigure them through `StateEffect.reconfigure` without rebuilding the editor.

### `buildDecorations(view, plugins)`

```
1. Resolve visibleRanges (falls back to the whole doc before the view has measured)
2. Create DecorationContext { view, decorations[], visibleRanges, iterateVisible,
                              selectionOverlapsRange, cursorInRange }
3. Sort plugins by decorationPriority ASCENDING (low number = runs first)
4. For each plugin: try { plugin.buildDecorations(ctx) } catch { /* swallowed */ }
5. Sort the collected array by (from, startSide)
6. Feed into RangeSetBuilder in order
7. Return the finished DecorationSet
```

Four things worth internalising:

- **The walk is viewport-scoped, and that is the core's job.** `ctx.iterateVisible` bounds
  the tree walk to `view.visibleRanges`. Before C-016 no plugin did this, so a single
  update cost 14 full-document walks — on cursor movement as much as on edits. Fixing it
  in the context rather than in each plugin is what stops the next plugin repeating it.
  Lezer yields nodes that *overlap* the bounds, so a construct straddling the viewport
  edge is entered and decorated in full. When the viewport is split into several ranges,
  `iterateVisible` deduplicates nodes spanning a gap.
- **Plugins push into a shared array.** They do not return decorations. This lets several
  plugins decorate overlapping ranges without any of them knowing about the others.
- **Sorting is centralised.** A plugin may push in whatever order is convenient for its
  own tree walk; `view-plugin.ts:65` normalises. Never hand-sort inside a plugin.
- **Errors are swallowed** (`view-plugin.ts:57`). This is intentional: Lezer can hand out
  a partially-built `TreeBuffer` mid-parse and node access throws `Invalid child in
posBefore`. Those states resolve on the next update. **The cost is that genuine plugin
  bugs disappear silently** — if a decoration "just doesn't show up", temporarily replace
  the `catch` with a `console.error` before assuming your logic is wrong. Tracked as an
  open task.

### Rebuild triggers

```ts
if (update.docChanged || update.selectionSet || update.viewportChanged)
```

`selectionSet` is the interesting one: it is what makes syntax markers appear when the
cursor enters a construct. It also means **decorations rebuild on every cursor move**, so
`buildDecorations` sits on the interactive hot path. Keep plugin implementations to a
single `ctx.iterateVisible` and avoid allocation in the enter callback.

`viewportChanged` is what keeps viewport scoping correct: scrolling brings new ranges into
view and rebuilds against them.

### `buildNodes()` — AST emission

When `onNodesChange` is supplied, the plugin materialises the **entire** syntax tree into
a `DraftlyNode[]` on every rebuild, tagging each node with `isSelected`.

> **Cost warning:** this is a full-document walk that allocates one object per node, and
> it runs on every cursor move. It was **not** brought under C-016's viewport scoping —
> the callback's contract is the whole tree, and narrowing it is a public API change
> (T-013). It exists for playground/devtools use (outline, AST
> inspector). Do not encourage it in production integrations without debouncing.

### `.cm-draftly` class

`EditorView.editorAttributes.of({ class: "cm-draftly" })` is added only in rich mode.
Every layout style in `theme.ts` is scoped under `&.cm-draftly`, so raw mode inherits
none of Draftly's opinions about width, padding, or font.

---

## `utils.ts` — shared helpers

### Selection predicates

```ts
cursorInRange(view, from, to); // main selection only
selectionOverlapsRange(view, from, to); // any range — multi-cursor aware
```

Both are exposed to plugins through `DecorationContext` rather than imported directly, so
a plugin never reaches into `view.state.selection` itself. **Prefer
`selectionOverlapsRange` for reveal/hide logic** — `cursorInRange` misses secondary
cursors and produces the bug where one of several cursors sits inside hidden syntax.

### `toggleMarkdownStyle(marker)`

Returns a CodeMirror command that wraps, unwraps, or inserts a paired marker (`**`, `~~`,
…) around the main selection. Handles three cases: already-wrapped (strip), empty
selection (insert pair, place cursor between), and non-empty (wrap). Used by
`InlinePlugin`'s keymap.

Note it operates on `state.selection.main` only, unlike
`lib/input-handler.ts`'s `createWrapSelectionInputHandler`, which is multi-cursor aware.
That asymmetry is a rough edge, not a design decision.

---

## Extending the core

Add to `editor/` only when the change is **feature-agnostic**. The test: could two
unrelated plugins both want it?

- New per-plugin capability → new overridable method on `DraftlyPlugin` ([plugin-system.md](./plugin-system.md))
- New composition-time option → `DraftlyConfig` + a branch in `draftly()`
- New value the view plugin needs → a new facet, following the three existing ones
- Anything markdown-feature-specific → **a plugin**, not the core
