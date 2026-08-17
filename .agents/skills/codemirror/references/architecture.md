# CodeMirror 6 Architecture

> Docs: [System Guide](https://codemirror.net/docs/guide/) · [Reference Manual](https://codemirror.net/docs/ref/)

## Data model

Documents are flat strings stored in a balanced tree (`Text`), enabling efficient slicing and line indexing. Access:

```ts
state.doc.toString()           // full string
state.doc.line(1).text        // first line content (1-based)
state.doc.lineAt(pos).number  // line number at offset
state.doc.length              // total char count
state.sliceDoc(from, to)      // substring without full toString()
```

**Positions** count UTF-16 code units (astral/emoji characters = 2 units each). Line breaks always count as 1 unit.

## State

`EditorState` is immutable. Every update produces a new state via a `Transaction`:

```
EditorState → Transaction → EditorState
```

Fields on state:
- `state.doc` — the document
- `state.selection` — current selection (one or more ranges)
- `state.field(myField)` — read a custom state field

## Transactions

Built with `state.update(spec)` or dispatched directly:

```ts
const tr = state.update({
  changes: [{ from: 5, to: 10, insert: "hello" }], // original-doc positions
  selection: { anchor: 5 },                         // new-doc positions
  scrollIntoView: true,
  annotations: [Transaction.userEvent.of("input")],
  effects: [myEffect.of(value)],
})
const newState = tr.state
```

**Important**: All `changes` in a transaction reference **original** document positions (they are applied simultaneously). `selection` and `effects` reference **new** document positions after changes are applied.

Transaction annotations communicate intent (e.g., `"input"`, `"paste"`, `"undo"`). Extensions use these to decide how to react.

### Multi-selection changes

Use `state.changeByRange()` to apply an operation to each selection range independently:

```ts
view.dispatch(view.state.changeByRange(range => ({
  changes: { from: range.from, to: range.to, insert: "!" },
  range: EditorSelection.cursor(range.from + 1),
})))
```

### Filtering transactions

```ts
// Cancel or modify incoming transactions
EditorState.transactionFilter.of(tr => {
  if (shouldCancel(tr)) return [] // cancel
  return tr
})

// Add effects/annotations to transactions from other extensions
EditorState.transactionExtender.of(tr => ({
  effects: [myEffect.of(tr.docChanged)],
}))
```

## Selection

`EditorSelection` contains one or more `SelectionRange` objects. The `main` range is reflected in the DOM:

```ts
state.selection.main.from   // anchor or head (whichever is smaller)
state.selection.main.to
state.selection.main.empty  // true if cursor (no selection)
state.selection.ranges      // all ranges, sorted, non-overlapping
```

Enable multiple selections with `EditorState.allowMultipleSelections.of(true)` plus `drawSelection()` to render them (browser can only show one native selection).

## Facets

Facets are typed extension points — they combine inputs from multiple extensions into one output:

```ts
// Single-value facet: highest precedence wins
state.facet(EditorState.tabSize)  // → number

// Array facet: all values collected
state.facet(EditorView.domEventHandlers)
```

Custom facet:

```ts
import { Facet } from "@codemirror/state"

const myConfig = Facet.define<string, string>({
  combine: (values) => values[0] ?? "default",
})

// Use in extension
myConfig.of("my-value")
```

## EditorView API

```ts
view.state            // current EditorState
view.dom              // root DOM element (.cm-editor)
view.hasFocus         // boolean
view.viewport         // {from, to} visible range
view.visibleRanges    // precise rendered segments (excludes folded/overflow)
view.dispatch(tr)     // apply a transaction
view.destroy()        // release resources — always call when removing editor

// Coordinate utilities (only work for viewport positions)
view.coordsAtPos(pos)        // → {left, right, top, bottom} | null
view.posAtCoords({x, y})     // → number | null

// Schedule code that reads layout (getBoundingClientRect etc.)
view.requestMeasure({ read(view) { /* measure */ }, write(measure, view) { /* update */ } })
```

## EditorView update cycle

1. `view.dispatch(tr)` — triggers update
2. **Write phase** — DOM updated synchronously
3. **Measure phase** — layout queries via `requestAnimationFrame`
4. Optional second write phase if measure caused changes

Never read layout in the write phase — use `view.requestMeasure()` or `ViewPlugin` measure hooks.

## Viewport

Only visible lines are in the DOM. `view.viewport` gives the `{from, to}` range of rendered content. `view.visibleRanges` gives precise rendered segments.

For decorations that need viewport info, use a `ViewPlugin` and access `update.view.viewport`.

## DOM structure

```
<div class="cm-editor [theme-classes]">
  <div class="cm-scroller">
    <div class="cm-content" contenteditable="true">
      <div class="cm-line">...</div>
    </div>
  </div>
</div>
```

The editor uses `contenteditable` and intercepts browser input via `MutationObserver` and input events.
