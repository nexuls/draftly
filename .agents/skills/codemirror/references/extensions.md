# CodeMirror 6 Extensions

> Docs: [Core Extensions](https://codemirror.net/docs/extensions/) · [Reference Manual](https://codemirror.net/docs/ref/) · [Examples](https://codemirror.net/examples/)

## Extension types

| Type | Purpose |
|---|---|
| State field | Store custom immutable data in editor state |
| View plugin | Imperative DOM manipulation, event handling |
| Decoration | Style or modify document rendering |
| Facet value | Configure a typed extension point |
| Compartment | Dynamically reconfigurable sub-extension |

## minimalSetup vs basicSetup

```ts
import { basicSetup, minimalSetup, EditorView } from "codemirror"

// basicSetup: history, lineNumbers, foldGutter, bracketMatching,
//             autocompletion, highlightActiveLine, search, and more
// minimalSetup: only history, highlightSpecialChars, drawSelection,
//               dropCursor, syntaxHighlighting, defaultKeymap, closeBracketsKeymap
```

## State fields

```ts
import { StateField, StateEffect } from "@codemirror/state"

const setCount = StateEffect.define<number>()

const countField = StateField.define<number>({
  create() { return 0 },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCount)) return effect.value
    }
    return value
  },
})

// Dispatch an effect
view.dispatch({ effects: setCount.of(42) })

// Read
view.state.field(countField)
```

## View plugins

```ts
import { ViewPlugin, ViewUpdate } from "@codemirror/view"

const myPlugin = ViewPlugin.fromClass(class {
  constructor(view: EditorView) {
    // setup
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      // respond to changes
    }
  }
  destroy() {
    // cleanup
  }
})
```

ViewPlugins with decorations:

```ts
ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) {
    this.decorations = this.build(view)
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged)
      this.decorations = this.build(update.view)
  }
  build(view: EditorView) {
    // return RangeSet of decorations
  }
}, { decorations: v => v.decorations })
```

## Decorations

Four decoration types:

```ts
import { Decoration } from "@codemirror/view"

// Mark: style a text range
Decoration.mark({ class: "cm-highlight" }).range(from, to)

// Widget: insert DOM element at position
Decoration.widget({
  widget: new class extends WidgetType {
    toDOM() {
      const el = document.createElement("span")
      el.textContent = "★"
      return el
    }
  },
  side: 1, // 1 = after position, -1 = before
}).range(pos)

// Replace: hide range, optionally show widget instead
Decoration.replace({ widget: myWidget }).range(from, to)

// Line decoration: add class/attributes to a whole line
Decoration.line({ class: "cm-error-line" }).range(line.from)
```

Build a `DecorationSet` with `RangeSet.of()`:

```ts
import { RangeSet } from "@codemirror/state"

const set = RangeSet.of([
  Decoration.mark({ class: "highlight" }).range(5, 10),
  Decoration.mark({ class: "highlight" }).range(20, 25),
])
```

## Compartments (dynamic config)

```ts
import { Compartment } from "@codemirror/state"
import { javascript } from "@codemirror/lang-javascript"
import { python } from "@codemirror/lang-python"

const langCompartment = new Compartment()

// Initial state
EditorState.create({
  extensions: [langCompartment.of(javascript())],
})

// Reconfigure at runtime
view.dispatch({
  effects: langCompartment.reconfigure(python()),
})
```

## Themes

```ts
import { EditorView } from "@codemirror/view"

// App theme (overrides base theme)
const myTheme = EditorView.theme({
  "&": { backgroundColor: "#1e1e1e", color: "#d4d4d4" },
  ".cm-content": { caretColor: "#528bff" },
  ".cm-gutters": { backgroundColor: "#1e1e1e", borderRight: "1px solid #333" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "#528bff" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#264f78",
  },
}, { dark: true })

// Base theme (lower priority, for library defaults)
const baseTheme = EditorView.baseTheme({
  "&light .cm-myEl": { color: "black" },
  "&dark .cm-myEl": { color: "white" },
})
```

## Key bindings

```ts
import { keymap } from "@codemirror/view"
import { defaultKeymap, historyKeymap } from "@codemirror/commands"

keymap.of([
  ...defaultKeymap,
  ...historyKeymap,
  {
    key: "Ctrl-s",
    run(view) {
      save(view.state.doc.toString())
      return true  // handled
    },
  },
])
```

A command returns `true` if it handled the key, `false` to fall through.

## Precedence

Extensions at higher precedence override lower ones for single-value facets:

```ts
import { Prec } from "@codemirror/state"

Prec.highest(keymap.of([{ key: "Enter", run: myEnter }]))
```

Levels: `highest > high > default > low > lowest`

## Placeholder

```ts
import { placeholder } from "@codemirror/view"

EditorState.create({
  extensions: [placeholder("Start typing…")],
})
```

## Multiple selections

```ts
import { EditorState } from "@codemirror/state"
import { drawSelection, rectangularSelection, crosshairCursor } from "@codemirror/view"

EditorState.create({
  extensions: [
    EditorState.allowMultipleSelections.of(true),
    drawSelection(),        // renders all ranges (browser only shows one native cursor)
    rectangularSelection(), // Alt+drag to create rectangular selection
    crosshairCursor(),      // shows crosshair cursor when Alt is held
  ],
})
```

## Search

```ts
import { search, searchKeymap } from "@codemirror/search"
import { keymap } from "@codemirror/view"

EditorState.create({
  extensions: [
    search({ top: true }), // top: true — panel appears at top; default is bottom
    keymap.of(searchKeymap), // Ctrl-F to open, Ctrl-H for replace
  ],
})
```

## Autocomplete

```ts
import { autocompletion, completionKeymap, CompletionContext } from "@codemirror/autocomplete"
import { keymap } from "@codemirror/view"

// Custom completion source
function myCompletions(context: CompletionContext) {
  const word = context.matchBefore(/\w+/)
  if (!word || (!word.text && !context.explicit)) return null
  return {
    from: word.from,
    options: [
      { label: "myFunc", type: "function" },
      { label: "myVar",  type: "variable" },
    ],
  }
}

EditorState.create({
  extensions: [
    autocompletion({ override: [myCompletions] }), // omit override to use language-provided completions
    keymap.of(completionKeymap), // Ctrl-Space to trigger
  ],
})
```

## Lint

```ts
import { linter, lintGutter, lintKeymap, Diagnostic } from "@codemirror/lint"
import { keymap } from "@codemirror/view"

EditorState.create({
  extensions: [
    lintGutter(),
    keymap.of(lintKeymap),
    linter(view => {
      const diagnostics: Diagnostic[] = []
      // inspect view.state.doc ...
      diagnostics.push({
        from: 0, to: 5,
        severity: "error", // "info" | "warning" | "error"
        message: "Something is wrong",
      })
      return diagnostics
    }),
  ],
})
```

## Code folding

```ts
import { foldGutter, foldKeymap, codeFolding } from "@codemirror/language"
import { keymap } from "@codemirror/view"

EditorState.create({
  extensions: [
    foldGutter(),
    codeFolding(), // requires a language with foldService
    keymap.of(foldKeymap), // Ctrl-Shift-[ to fold, Ctrl-Shift-] to unfold
  ],
})
```

## Hover tooltips

```ts
import { hoverTooltip } from "@codemirror/view"

EditorState.create({
  extensions: [
    hoverTooltip((view, pos) => {
      const word = view.state.doc.sliceString(pos - 5, pos + 5)
      return {
        pos,
        above: true,
        create() {
          const dom = document.createElement("div")
          dom.textContent = `Hover: ${word}`
          return { dom }
        },
      }
    }),
  ],
})
```

## Transaction filtering

```ts
import { EditorState } from "@codemirror/state"

EditorState.create({
  extensions: [
    // Cancel or modify transactions
    EditorState.transactionFilter.of(tr => {
      if (tr.docChanged && shouldBlock(tr)) return [] // cancel
      return tr
    }),

    // Add effects/annotations to transactions from any source
    EditorState.transactionExtender.of(tr => {
      if (tr.docChanged) return { effects: [myEffect.of(true)] }
      return null
    }),

    // Filter individual changes (return false to block)
    EditorState.changeFilter.of(_tr => false),
  ],
})
```

## Input interception

```ts
import { EditorView } from "@codemirror/view"

EditorState.create({
  extensions: [
    EditorView.inputHandler.of((view, from, to, text) => {
      if (text === "/" && shouldAutocomplete(view, from)) {
        view.dispatch({ changes: { from, to, insert: "/ " } })
        return true // handled — prevent default insert
      }
      return false // let default input handling proceed
    }),
  ],
})
```

## Scroll past end

```ts
import { scrollPastEnd } from "@codemirror/view"

EditorState.create({
  extensions: [scrollPastEnd()],
})
```

## Commands (StateCommand)

```ts
import { StateCommand } from "@codemirror/state"

// StateCommand takes {state, dispatch} instead of EditorView
// Useful for testing without creating a view
const myCommand: StateCommand = ({ state, dispatch }) => {
  dispatch(state.update({ changes: { from: 0, insert: "!" } }))
  return true
}
```
