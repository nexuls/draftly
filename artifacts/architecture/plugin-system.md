# Plugin System

> Last verified: 2026-08-18 · commit `86335cd`
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

### Instance lifetime

**One plugin instance belongs to one editor.** `createEssentialPlugins()`
(`plugins/index.ts`) and `createAllPlugins()` (`plugins/all.ts`) construct a fresh set on
every call, and a consumer calls one of them per editor.

This is not stylistic. Plugin objects carry per-editor state — `_config` and `_context` on
the base class, `draftlyConfig` and three pending-view re-entrancy locks on `TablePlugin` —
and before C-026 the exported `essentialPlugins` / `allPlugins` arrays were module-level
singletons shared by every importer. Two editors on one page therefore:

1. **overwrote each other's config.** The second `draftly()` call's `onRegister` replaced
   the first's `_context`, so editor A rendered using editor B's configuration.
2. **cancelled each other's scheduled work.** `scheduleNormalization` guards on a single
   `pendingNormalizationView` field; B's schedule overwrote A's, and A's queued microtask
   then saw a mismatch and returned silently.

Those arrays still exist, still shared, marked `@deprecated`. They will go in a major.

**The authoring rule that follows:** a plugin must not hold state belonging to a view.
Anything derived from a specific `EditorView` — a pending timer, a scheduled microtask's
target, a cached measurement, the view itself — keys off the view (a `WeakMap`, or a
CodeMirror `StateField`) or is released in `onViewDestroy`. `_config`/`_context` are the
sanctioned exception, and only because they are written once at composition time.

Note that per-editor instances fix the *sharing* half of the problem, not the *retention*
half: an instance that holds a destroyed view still pins it. `onViewDestroy` remains
mandatory.

### Lifecycle hooks

| Hook                    | When                                    | Base behaviour    |
| ----------------------- | --------------------------------------- | ----------------- |
| `onRegister(ctx)`       | Composition time, before extensions     | Stores `_context` |
| `onViewReady(view)`     | `ViewPlugin` constructor                | No-op             |
| `onViewUpdate(update)`  | Every `ViewUpdate`, unconditionally     | No-op             |
| `onViewDestroy(view)`   | `ViewPlugin.destroy()`                  | No-op             |
| ~~`onUnregister()`~~    | **Never — deprecated**                  | Clears `_context` |

**Release view-scoped state in `onViewDestroy`.** A plugin instance outlives the view that
used it, so a retained `EditorView` retains its DOM, its state and the whole document for
the lifetime of the page. Added in C-018, along with the view plugin's `destroy()` — before
that the library had no teardown path at all. It fires on every reconfigure as well as on a
real teardown, because a host that rebuilds its extension array destroys and recreates the
view.

`EditorView` has **no public "destroyed" flag**, so async work already in flight cannot
ask the view whether it is still alive. `TablePlugin` keeps a `WeakSet` of torn-down views
and checks it before dispatching; copy that pattern rather than inventing another.

`onUnregister` is **deprecated and never called.** C-026 removed one of the two reasons —
with per-editor instances, clearing `_context` no longer breaks other editors — but the
other stands: plugin registration is not scoped to a view, so there is no event to fire it
on. It is kept because it is public API.

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
- Return **`null`** to decline. The next candidate plugin for the node is tried, then the
  default renderer, then the escaped leaf fallback. This is how a plugin claims a node
  type broadly via `requiredNodes` and then opts out per node — and it is the mechanism
  that lets a consumer's plugin sit alongside a built-in rather than replacing it.
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

0. **Walk the tree with `ctx.iterateVisible`, never `syntaxTree(view.state).iterate`.**
   The context supplies the viewport bounds. An unbounded walk makes every update cost
   O(document), and decorations rebuild on cursor movement as well as edits — this was
   the library's dominant performance cost until C-016. Nodes overlapping the viewport
   are still entered, so constructs straddling the edge decorate correctly.
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
   `createEssentialPlugins()` factory. A plugin with a heavy third-party dependency
   instead gets its own entry point (`src/plugins/<name>.ts` + `tsup.config.ts` +
   `exports`) and is added to `createAllPlugins()` in `plugins/all.ts`; putting it in the
   barrel puts its dependency in every consumer's bundle. See
   [`build-and-tooling.md`](./build-and-tooling.md#plugin-entry-points).
8. **Escape attribute values; sanitize fragments.** These are different operations and
   `ctx.sanitize()` only does the second one. An attribute value or a run of text goes
   through `escapeHtml` from `draftly/lib`; a blob of HTML that is *meant* to stay markup
   goes through `ctx.sanitize()`. Conflating them is what produced C-011 —
   `href="${ctx.sanitize(url)}"` let a quote in the URL open a new attribute, because
   DOMPurify parses fragments and a bare string is not one.
9. **`WidgetType.eq()` compares content, never `from`/`to`.** Positions shift on any edit
   above the widget, so comparing them means `eq` never reports equality and CodeMirror
   rebuilds the DOM on every keystroke — re-running KaTeX, mermaid and image loads. A
   handler that needs a range calls `resolveWidgetRange(view, dom, [nodeName])` from
   `draftly/lib`, which reads it from the live DOM at event time.
10. **A widget that starts async work implements `destroy()`.** Set a `disposed` flag,
    clear pending timers, and check both `disposed` and `element.isConnected` before
    writing DOM — the flag catches a teardown CodeMirror announced, `isConnected` catches
    an element that left the document without it. `MermaidBlockWidget` and
    `CodeBlockHeaderWidget` are the reference implementations.
11. **Decide whether your widget is decorative or a control, and build accordingly.**
    A widget is a **control** only if activating it is the *only* way to do something —
    `TaskCheckboxWidget` is the sole example, because it mutates the document and the raw
    `[ ]` it replaces is hidden. Everything else merely reveals markdown the cursor can
    already reach, and CodeMirror's own accessibility model exposes that text.

    Decorative widgets need an accessible **name** (`role="img"` plus `aria-label`, or an
    equivalent) so their content is announced. They must **not** be made focusable:
    focusable children inside `contenteditable` fight the editor's focus and selection
    handling, for no gain when the underlying text is reachable anyway.

    A control's interaction belongs on `getKeymap()`, which works regardless of focus
    semantics — that is how `Mod-Enter` toggles a task.

    Do not add an `aria-label` over content that already carries its own accessible
    representation. KaTeX emits MathML beside its visual output; labelling the container
    would replace it with a flat string.
12. **Run every URL through `safeUrl()`** from `draftly/lib` before it reaches an `href`,
   a `src`, or `window.open` — on **both** surfaces. Setting a DOM property protects
   against injection but not against `javascript:`. Pass `{ allowDataImages: true }` only
   for an image `src`.

### Choosing `decorationPriority`

One number, two surfaces, and the sorts point opposite ways on purpose:

| Surface | Sort       | Composition                                  | Who wins        |
| ------- | ---------- | -------------------------------------------- | --------------- |
| Editor  | ascending  | every plugin runs; later layers over earlier | higher priority |
| Preview | descending | first non-null `renderToHTML` result is used | higher priority |

The *outcome* is the same on both — a higher number wins — which is the point. Preview
used to dispatch in whatever order the consumer wrote their plugin array, so a custom
plugin overriding a built-in behaved one way in the editor and another in preview. Fixed
in C-014.

Two plugins claiming the same node at the same priority is genuinely ambiguous; it warns
in development.

Current allocation:

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
