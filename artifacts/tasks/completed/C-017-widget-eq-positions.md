# C-017 — Remove document positions from widget `eq()`

**Status:** Complete
**Priority:** High
**Created:** 2026-08-18
**Completed:** 2026-08-18

## Problem

Six widgets compare `from` and `to` in `eq()`:

| Widget                 | Site                    |
| ---------------------- | ----------------------- |
| `ImageWidget`          | `image-plugin.ts:54`    |
| `LinkTooltipWidget`    | `link-plugin.ts:50`     |
| `LinkTextWidget`       | `link-plugin.ts:337`    |
| `InlineMathWidget`     | `math-plugin.ts:74`     |
| `MathBlockWidget`      | `math-plugin.ts:123`    |
| `MermaidBlockWidget`   | `mermaid-plugin.ts:96`  |

`eq()` exists to answer "can CodeMirror keep the DOM it already built?". Document
positions shift on **any** edit earlier in the document, so the answer is permanently no.
Typing one character at the top of a file tears down and rebuilds every widget below it.

What that costs, concretely:

- **KaTeX re-renders every formula in the document on every keystroke.** `renderMath` runs
  synchronously inside `toDOM` (`math-plugin.ts:82`, `:131`).
- **Mermaid re-renders every diagram on every keystroke** — an async `mermaid.render()`
  per diagram, each building a fresh DOM subtree and burning a new global id
  (`mermaid-plugin.ts:29`). Each one also flashes "Rendering diagram…" first
  (`mermaid-plugin.ts:110`), so a document with a diagram visibly strobes while typing.
- **Every `<img>` is destroyed and re-created**, causing flicker and, depending on cache
  headers, re-fetching.

`CodeBlockHeaderWidget` (`code-plugin.ts:192`) and `TaskCheckboxWidget`
(`list-plugin.ts:45`) already do this correctly — they compare content only.

## Proposed approach

The positions are in the widget because the click handlers need them, to dispatch a
selection over the raw markdown. That need is real; storing them is the wrong solution.

1. **Drop `from`/`to` from `eq()`** on all six widgets. Compare only rendering-relevant
   content: `url`/`alt`/`title` for images, `latex` for math, `definition` +
   `attributes` + `defaultTheme` for mermaid, `text`/`url`/`title` for links.
2. **Resolve position at event time** with `view.posAtDOM(element)`, exactly as
   `TaskCheckboxWidget.toggleCheckbox` already does (`list-plugin.ts:74`). The handler
   then works from the widget's live DOM position rather than a snapshot that goes stale.
3. **Derive the range from the tree at click time.** `posAtDOM` gives a position; the
   handler wants the enclosing construct's range. Resolve it via `syntaxTree(view.state)`
   and walk to the node of the expected type. This is more robust than the current
   snapshot even ignoring performance — today a click after an edit selects a stale range.
4. **Keep the positions as constructor fields if convenient**, just out of `eq`. They are
   a reasonable fast path as long as nothing depends on their being current.
5. **Also fix the `attributes` comparison** in `MermaidBlockWidget` — `JSON.stringify`
   for object equality is key-order-dependent and allocates on every comparison. Compare
   entries directly.

## Affected areas

- `plugins/image-plugin.ts`, `plugins/link-plugin.ts`, `plugins/math-plugin.ts`,
  `plugins/mermaid-plugin.ts` — `eq` and the click handlers
- `artifacts/architecture/plugin-system.md` — widget authoring guidance
- `AGENTS.md` — "Add a plugin" checklist gains an `eq()` rule
- `artifacts/memory.md` — durable fact: `eq()` compares *content*, never positions

## Acceptance

- [x] Typing above a mermaid diagram does not re-render it — `eq()` now reports equality;
      the visual "no loading flash" half needs a browser
- [x] Typing above a KaTeX formula does not re-render it — same
- [x] Typing above an image does not cause visible flicker — same
- [x] Clicking a widget after edits above it still selects the correct raw markdown range
- [x] Widget click behaviour unchanged in all other respects
- [ ] **Cursor entering a construct still retracts the widget — NOT verified.** Untouched
      by this change (retraction is a `selectionOverlapsRange` guard in `buildDecorations`,
      not a widget concern), but it is a browser check and no browser was available.

## Outcome

Landed as `perf(draftly): Compare widget content, not positions, in eq()`.

All six widgets now compare content only:

| Widget                 | Compares                             |
| ---------------------- | ------------------------------------ |
| `ImageWidget`          | `url`, `alt`, `title`                |
| `LinkTooltipWidget`    | `url`                                |
| `LinkTextWidget`       | `text`, `url`, `title`               |
| `InlineMathWidget`     | `latex`                              |
| `MathBlockWidget`      | `latex`                              |
| `MermaidBlockWidget`   | `definition`, `attributes`, `defaultTheme` |

`from`/`to` are kept as constructor fields, per proposal item 4 — they are a fine fallback,
just not an equality criterion.

### `resolveWidgetRange()`

New `lib/widget-position.ts`, exported from `draftly/lib`. The handlers need a range; the
fix is to resolve one rather than to store one.

```ts
const range = resolveWidgetRange(view, element, ["Link"]) ?? { from: this.from, to: this.to };
```

It calls `view.posAtDOM(element)` and walks up the syntax tree to the nearest node of an
expected type — proposal item 3, which is more robust than the old snapshot regardless of
performance: clicking a widget after an edit above it used to select a stale range.

**Both sides of the position are tried**, because Draftly places widgets two ways:
`Decoration.replace(from, to)` puts the position at the construct's start, and
`Decoration.widget({ side: 1 }).range(to)` puts it at the end. One `resolveInner` side
handles one case and not the other.

`posAtDOM` is wrapped in a `try` — a click racing a teardown throws there, and returning
`null` falls back to the stored positions rather than propagating.

Also exported `shallowEqualRecord`, which replaces `MermaidBlockWidget`'s
`JSON.stringify` attribute comparison (proposal item 5): key-order dependent, and two
string allocations inside a function whose whole job is to be cheap per keystroke.

### Verification

No browser, so both halves were checked structurally:

1. **Range resolution** — for a document containing a link, inline math, an image, a math
   block and a mermaid block, `resolveWidgetRange` recovers the exact node range from
   *both* placements (start position and end position). **10/10.**
2. **Reuse** — built decorations for a document, then for the same document with a heading
   inserted above it, and compared each widget with its counterpart. **6/6 now report
   equal**; before this change, 0/6 did.

### Not done

The task's aside about collapsing `LinkTooltipWidget` and `LinkTextWidget` — near
duplicates with the same tooltip DOM, listeners and handler — was explicitly scoped as a
separate commit and is left as one. Worth a follow-up task.

## Notes

- Land after T-011. Until decoration building is viewport-scoped, everything is rebuilt on
  every update regardless and this change will look like it did nothing.
- `LinkTooltipWidget` and `LinkTextWidget` are near-duplicates (`link-plugin.ts:41` and
  `:326`) — same tooltip DOM, same three listeners, same handler logic. Worth collapsing
  into one while in there, but as a separate commit.
