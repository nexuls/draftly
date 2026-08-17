---
name: codemirror
description: Set up and configure CodeMirror 6 editor. Use when integrating a code editor into a web app, adding syntax highlighting, themes, extensions, or custom key bindings with @codemirror/* packages.
license: MIT
metadata:
  author: solanabettercall
  version: "1.0"
compatibility: Node.js + npm/pnpm. Browser environment required for EditorView.
---

# CodeMirror 6

CodeMirror 6 is a modular text editor library. Three core packages:

- `@codemirror/state` — immutable editor state, documents, transactions
- `@codemirror/view` — EditorView, DOM rendering, user input handling
- `@codemirror/commands` — editing commands and default key bindings

## Minimal setup

```ts
import { EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { defaultKeymap } from "@codemirror/commands"

const view = new EditorView({
  state: EditorState.create({
    doc: "Hello World",
    extensions: [keymap.of(defaultKeymap)],
  }),
  parent: document.body,
})
```

For quick setup with batteries included, use the `codemirror` meta-package:

```ts
import { basicSetup, EditorView } from "codemirror"
// or minimalSetup for just the essentials (undo, special chars, close brackets)
import { minimalSetup, EditorView } from "codemirror"

const view = new EditorView({
  doc: "Hello World",
  extensions: [basicSetup],
  parent: document.body,
})
```

## Install

```bash
npm install codemirror @codemirror/state @codemirror/view @codemirror/commands
```

For language support (add as needed):

```bash
npm install @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-json
```

## Extensions

Extensions are passed in the `extensions` array. Order matters — higher index = lower precedence.

```ts
import { javascript } from "@codemirror/lang-javascript"
import { oneDark } from "@codemirror/theme-one-dark"
import { lineNumbers, highlightActiveLine } from "@codemirror/view"

EditorState.create({
  extensions: [
    basicSetup,
    javascript(),
    oneDark,
    lineNumbers(),
    highlightActiveLine(),
  ],
})
```

## Transactions (state updates)

Never mutate state directly — dispatch transactions:

```ts
view.dispatch({
  changes: { from: 0, to: view.state.doc.length, insert: "new content" },
  scrollIntoView: true,
})

// Move cursor
view.dispatch({
  selection: { anchor: 10 },
})

// Read document
const content = view.state.doc.toString()
const slice = view.state.sliceDoc(5, 20) // substring without full toString()

// Apply to each selection range (multi-selection safe)
view.dispatch(view.state.changeByRange(range => ({
  changes: { from: range.from, to: range.to, insert: "replacement" },
  range: EditorSelection.cursor(range.from + "replacement".length),
})))

// Filter/intercept transactions (pass as extension)
const blockEdits = EditorState.transactionFilter.of(tr => {
  if (tr.docChanged && isReadOnly) return [] // cancel
  return tr
})
```

## Themes

```ts
import { EditorView } from "@codemirror/view"

const myTheme = EditorView.theme({
  "&": { height: "400px" },
  ".cm-content": { fontFamily: "monospace", fontSize: "14px" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "#528bff" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    background: "#3E4451",
  },
})
```

Use `EditorView.baseTheme()` for themes that adapt to light/dark mode.

## Dynamic reconfiguration

```ts
import { Compartment } from "@codemirror/state"

const language = new Compartment()

const state = EditorState.create({
  extensions: [language.of(javascript())],
})

// Switch language at runtime
view.dispatch({
  effects: language.reconfigure(python()),
})
```

## Listen to changes

```ts
import { EditorView } from "@codemirror/view"

const updateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged) {
    console.log(update.state.doc.toString())
  }
})
```

## Make read-only

```ts
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

// Prevents editing commands from modifying content
EditorState.create({ extensions: [EditorState.readOnly.of(true)] })

// Also removes editable=true from the DOM (no cursor, not focusable as editor)
EditorState.create({ extensions: [EditorView.editable.of(false)] })
```

## Placeholder text

```ts
import { placeholder } from "@codemirror/view"

EditorState.create({
  extensions: [placeholder("Start typing…")],
})
```

## Coordinate utilities

```ts
// Document offset → screen coordinates
const coords = view.coordsAtPos(pos) // {left, right, top, bottom} | null

// Screen coordinates → document offset
const pos = view.posAtCoords({ x, y }) // number | null

// Only works for positions inside the current viewport
```

## Destroy editor

```ts
view.destroy()
```

## Gotchas

- `EditorView` requires a DOM environment — not usable in Node.js/SSR without mocking. Use `EditorState` alone for server-side operations.
- Positions count **UTF-16 code units**, not bytes or characters. Astral/emoji characters (e.g. 🎉) occupy 2 units. Use `view.state.doc.line(n)` to get line positions.
- In a single transaction, all `changes` reference **original** document positions (they happen simultaneously). `selection` and `effects` reference the **new** document positions after changes.
- Extensions are immutable after creation. Use `Compartment` for dynamic reconfiguration.
- `basicSetup` includes undo history, line numbers, bracket matching, and more — avoid duplicating these extensions.
- Always call `view.destroy()` when removing an editor from the DOM to release resources.

## Reference

- [Architecture details](references/architecture.md) — state model, transactions, viewport rendering
- [Extensions deep dive](references/extensions.md) — state fields, view plugins, decorations, facets
- [Boilerplate](assets/basic-setup.ts) — copy-paste TypeScript starter

### Official docs

- [System Guide](https://codemirror.net/docs/guide/) — concepts, patterns, best practices
- [Reference Manual](https://codemirror.net/docs/ref/) — full public API
- [Core Extensions](https://codemirror.net/docs/extensions/) — all built-in extensions
- [Examples](https://codemirror.net/examples/) — runnable use-case demos
