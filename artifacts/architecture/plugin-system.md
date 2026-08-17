# Plugin System

> Last verified: 2026-08-18 · commit `eae4434`
> Source: `packages/draftly/src/editor/plugin.ts`

The plugin contract is the single most important abstraction in Draftly. Everything a
markdown feature needs — parsing, editing, styling, and static rendering — is declared on
one class.

---

## Class hierarchy

```
DraftlyPlugin  (abstract)
├── DecorationPlugin  (abstract) — decorationPriority defaults to 50,
│                                  buildDecorations() becomes abstract
└── SyntaxPlugin      (abstract) — getMarkdownConfig() becomes abstract
```

The two subclasses add no behaviour. They exist purely to make intent explicit and to let
the compiler enforce that a decoration plugin actually decorates. Pick the one that
matches the plugin's centre of gravity; extend `DraftlyPlugin` directly when a plugin is
render-only (e.g. `ParagraphPlugin`).

---

## The contract

### Required identity

```ts
abstract readonly name: string;     // unique, kebab-case, e.g. "table"
abstract readonly version: string;  // semver, bumped on breaking plugin changes
```

`name` is used in generated CSS comments and by the playground's plugin toggles.
`version` is bumped independently of the package version — `TablePlugin` is at `2.0.0`
after its rewrite while every other plugin is at `1.0.0`.

### Declarative metadata

```ts
readonly decorationPriority: number = 100;   // ASCENDING — lower runs first
readonly dependencies: string[] = [];         // declared but NOT yet enforced
readonly requiredNodes: readonly string[] = []; // preview dispatch key
```

**`requiredNodes` is load-bearing.** `PreviewRenderer` builds a `Map<nodeName, plugin[]>`
from it; a plugin with `renderToHTML()` but no `requiredNodes` will never be called in
preview. This is the single most common way to write a plugin that "works in the editor
but not in preview".

**`dependencies` is currently inert.** It is declared on the base class but nothing reads
it — there is no topological sort and no validation. Treat it as documentation until the
ordering task lands (see [../tasks/ongoing/](../tasks/ongoing/)).

### Extension contribution (called once, at composition time)

| Method                | Returns                        | Called from                                                    |
| --------------------- | ------------------------------ | -------------------------------------------------------------- |
| `getExtensions()`     | `Extension[]`                  | `draftly()` — merged into the bundle                           |
| `getMarkdownConfig()` | `MarkdownConfig \| null`       | `draftly()` **and** `PreviewRenderer`                          |
| `getKeymap()`         | `KeyBinding[]`                 | `draftly()` — flattened into one `keymap.of`                   |
| `get theme()`         | `(t: ThemeEnum) => ThemeStyle` | `draftly()` → `EditorView.theme`; `generateCSS()` → scoped CSS |

`getMarkdownConfig()` being consumed by _both_ surfaces is what guarantees the editor and
the preview parse identically. Never register a parser extension anywhere else.

### Editor behaviour

```ts
buildDecorations(ctx: DecorationContext): void
```

Called on every rebuild (doc change, **selection change**, viewport change). Push into
`ctx.decorations`; do not return, do not sort, do not mutate the view.

```ts
interface DecorationContext {
  readonly view: EditorView;
  readonly decorations: Range<Decoration>[];
  selectionOverlapsRange(from: number, to: number): boolean;
  cursorInRange(from: number, to: number): boolean;
}
```

### Lifecycle hooks

| Hook                   | When                                | Base behaviour    |
| ---------------------- | ----------------------------------- | ----------------- |
| `onRegister(ctx)`      | Composition time, before extensions | Stores `_context` |
| `onUnregister()`       | Teardown                            | Clears `_context` |
| `onViewReady(view)`    | `ViewPlugin` constructor            | No-op             |
| `onViewUpdate(update)` | Every `ViewUpdate`, unconditionally | No-op             |

**Always call `super.onRegister(context)` when overriding it** — otherwise `this.context`
stays `null` and anything reading plugin config breaks. `TablePlugin.onRegister` is the
reference implementation.

`onViewUpdate` fires on _every_ update, including ones that do not rebuild decorations.
It is where stateful plugins schedule deferred work — `TablePlugin` uses it to queue
markdown normalisation, cell padding, and selection repair outside the update cycle
(dispatching during an update is illegal in CodeMirror).

### Preview rendering

```ts
renderToHTML ? (node, children, ctx) : string | null | Promise<string | null>;
```

Optional. Contract:

- Return an **HTML string** to take over rendering for this node.
- Return **`null`** to decline and let the next plugin, then the default renderer, handle it.
- Return **`""`** to render the node as nothing (how syntax markers like `HeaderMark` are
  dropped from static output).
- `children` is pre-rendered HTML for the node's children — but note it is computed
  _before_ the plugin is consulted, so declining still paid the cost.
- May be `async`; the whole preview pipeline is promise-based.

```ts
getPreviewStyles(theme, wrapperClass): string
```

Has a working default: runs `this.theme(theme)` through `transformToCss()`, which uses
`StyleModule` with a `finish` hook that prefixes every selector with `.${wrapperClass}`.
Override only when the preview markup structure differs enough from the editor DOM that
a mechanical prefix is wrong.

---

## Writing a plugin

Canonical structure — follow `heading-plugin.ts` (197 LOC, exercises most of the contract):

```ts
/**
 * Node names this plugin owns, hoisted so the decoration path and the
 * preview path cannot drift apart.
 */
const HEADING_TYPES = ["ATXHeading1" /* … */] as const;

/** Decoration instances are module-level singletons — created once, reused. */
const headingMarkDecorations = {
  "heading-1": Decoration.mark({ class: "cm-draftly-h1" }),
  "heading-mark": Decoration.replace({}),
};

export class HeadingPlugin extends DecorationPlugin {
  readonly name = "heading";
  readonly version = "1.0.0";
  override decorationPriority = 10;
  override readonly requiredNodes = [...HEADING_TYPES, "HeaderMark"] as const;

  override get theme() {
    return theme;
  }

  buildDecorations(ctx: DecorationContext): void {
    /* tree.iterate → push */
  }

  override renderToHTML(node, children): string | null {
    /* reuse the same class names */
  }
}

/** Theme lives at the bottom of the file, built with createTheme(). */
const theme = createTheme({
  default: {
    /* … */
  },
  dark: {
    /* … */
  },
});
```

### House rules

1. **Hoist decorations to module scope.** `Decoration.mark({...})` inside
   `buildDecorations` allocates on every keystroke.
2. **Read class names from the decoration specs in `renderToHTML`.** `HeadingPlugin` does
   `headingMarkDecorations["heading-1"].spec.class` rather than retyping the string —
   this is what mechanically enforces editor/preview parity.
3. **Guard every hiding decoration** with `ctx.selectionOverlapsRange(from, to)`.
4. **Clamp `Decoration.replace` ranges to the line end.** Spanning a newline throws.
5. **Never dispatch from `buildDecorations`.** Schedule via `onViewUpdate` +
   `requestAnimationFrame`/microtask, as `TablePlugin` does.
6. **Keep the theme at the bottom of the file** as a `createTheme()` call. Split into
   `*-plugin.theme.ts` when it dominates the file (precedent: `code-plugin.theme.ts`).
7. **Register in `plugins/index.ts`** — both the named export and the
   `essentialPlugins` array.

### Choosing `decorationPriority`

Lower runs first. Current allocation:

| Range | Used by                                    | Rationale                          |
| ----- | ------------------------------------------ | ---------------------------------- |
| 10    | `heading`, `quote`, `hr`                   | Block-level line decorations       |
| 20    | `inline`, `list`, `table`, `emoji`         | Block structure and inline marks   |
| 22–25 | `link`, `code`, `image`, `math`, `mermaid` | Replacements and widgets           |
| 30    | `html`                                     | Must observe everything else first |
| 50    | `DecorationPlugin` default                 |                                    |
| 100   | `DraftlyPlugin` default                    |                                    |

Pick a value inside an existing band rather than inventing a new one; note the choice in
a JSDoc comment when it is non-obvious.

---

## Extending the contract

Adding a hook to `DraftlyPlugin` affects every plugin, so:

1. Give it a **working default** on the base class — never make it abstract.
2. Document it with JSDoc on the base class, including when it fires.
3. Call it from exactly one place (`draftly.ts` or `view-plugin.ts` or `renderer.ts`).
4. Update this document _and_ the JSDoc together.
5. If it changes plugin-authoring expectations, bump the affected plugins' `version`.
