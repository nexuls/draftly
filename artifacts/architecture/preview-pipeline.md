# Preview Pipeline

> Last verified: 2026-08-18 · commit `eae4434`
> Source: `packages/draftly/src/preview/`

The preview module turns a markdown string into semantic HTML plus matching CSS, with
output that is visually identical to the live editor.

---

## Files

| File                   | LOC | Role                                                        |
| ---------------------- | --- | ----------------------------------------------------------- |
| `preview.ts`           | 41  | `preview()` entry point — config defaults + wrapper element |
| `renderer.ts`          | 158 | `PreviewRenderer` — parse, walk, dispatch                   |
| `context.ts`           | 41  | Builds the `PreviewContext` handed to plugins               |
| `css-generator.ts`     | 64  | `generateCSS()` — base + syntax + per-plugin styles         |
| `syntax-theme.ts`      | 110 | Extracts `tok-*` rules out of CodeMirror `HighlightStyle`s  |
| `default-renderers.ts` | 29  | Fallback renderers + `escapeHtml`                           |
| `types.ts`             | 86  | Public types                                                |

---

## `preview()`

```ts
export async function preview(markdown: string, config: PreviewConfig = {}): Promise<string>;
```

**It is async.** The whole pipeline is promise-based because `MermaidPlugin` renders
diagrams asynchronously and `TablePlugin` recursively awaits a nested `PreviewRenderer`
for cell content. Callers must `await`. (The public README shows a synchronous call —
that is documentation drift, see [../memory.md](../memory.md).)

Its own job is small: apply defaults, construct a `PreviewRenderer`, await it, and wrap
the result in `<article class="draftly-preview">`. All real work is in the renderer.

| Option         | Default             | Notes                                          |
| -------------- | ------------------- | ---------------------------------------------- |
| `plugins`      | `[]`                | Pass the same array as the editor for parity   |
| `markdown`     | `[]`                | Extra parser configs, prepended to plugin ones |
| `wrapperClass` | `"draftly-preview"` | Must match `generateCSS`'s `wrapperClass`      |
| `wrapperTag`   | `"article"`         | `article \| div \| section`                    |
| `sanitize`     | `true`              | Browser-only — see the caveat below            |
| `theme`        | `AUTO`              |                                                |
| `syntaxTheme`  | `undefined`         | A CodeMirror theme/`HighlightStyle` for code   |

---

## `PreviewRenderer` — the walk

### Construction

```ts
new PreviewRenderer(doc, plugins, markdownConfigs, theme, sanitize, syntaxTheme);
```

Two things are precomputed in the constructor:

1. **`nodeToPlugins: Map<string, DraftlyPlugin[]>`** — built from every plugin's
   `requiredNodes`, but only for plugins that actually define `renderToHTML`. This turns
   per-node dispatch into an O(1) map lookup instead of a scan over 14 plugins.
2. **`syntaxHighlighters`** — resolved once from `syntaxTheme` and stashed on the context.

### Parsing

```ts
const markdownSupport = markdown({
  base: markdownLanguage,
  codeLanguages: languages,
  extensions,
  addKeymap: true,
  completeHTMLTags: true,
  pasteURLAsLink: true,
});
const tree = markdownSupport.language.parser.parse(this.doc);
```

> **This is deliberate and load-bearing.** The renderer goes through
> `@codemirror/lang-markdown` rather than constructing a raw `@lezer/markdown` parser,
> and passes the _same_ option object the editor uses, so both surfaces produce trees of
> identical shape. Changed in `dab22ab` after preview and editor diverged on GFM node
> names. If you touch these options, change them in `draftly.ts` too.

### `renderNode(node)` — dispatch order

```
1. nodeToPlugins.get(node.name)?
     → for each plugin: children = await renderChildren(node)
                        result  = await plugin.renderToHTML(node, children, ctx)
                        if (result !== null) return result       ← first non-null wins
2. defaultRenderers[node.name]?  → renderer(node, await renderChildren(node), ctx)
3. node.firstChild?              → return await renderChildren(node)
4. leaf                          → return ctx.sliceDoc(node.from, node.to)
```

Note the cost in step 1: `renderChildren` is awaited **before** the plugin is consulted,
once per candidate plugin. A plugin that returns `null` has already paid for a full
subtree render. This is why plugins should decline via `requiredNodes` (never registering
for the node) rather than via a `null` return where possible.

Step 4 returns **raw, unescaped** text for unknown leaf nodes. Leaf node text that
reaches step 4 is markdown source, so this is usually correct — but a plugin introducing
a new leaf node type that can contain `<` must render it explicitly.

### `renderChildren(node)` — gap preservation

```ts
let pos = node.from;
for (child of node.children) {
  if (child.from > pos) result += escapeHtml(sliceDoc(pos, child.from)); // gap before
  result += await renderNode(child);
  pos = child.to;
}
if (pos < node.to) result += escapeHtml(sliceDoc(pos, node.to)); // trailing gap
```

The gap handling is what keeps plain text between nodes intact. Lezer's markdown tree
only creates nodes for _structure_ — the words in a paragraph are gaps, not nodes.
Without this loop, preview would render a document consisting entirely of punctuation.
**Gaps are always HTML-escaped; node output never is.**

---

## `PreviewContext`

Handed to every `renderToHTML` call:

```ts
interface PreviewContext {
  readonly doc: string;
  readonly theme: ThemeEnum;
  readonly syntaxHighlighters?: readonly Highlighter[];
  sliceDoc(from, to): string;
  sanitize(html): string;
  renderChildren(node): Promise<string>;
}
```

`renderChildren` is bound back to the renderer, so a plugin can recursively render
arbitrary subtrees — used by container plugins (blockquote, list) that need to control
the wrapper element but not the contents.

### ⚠️ `sanitize()` is a no-op on the server

```ts
sanitize(html) {
  if (!sanitizeHtml) return html;
  if (typeof window !== "undefined") return DOMPurify.sanitize(html);
  return html;   // ← server-side: returned unchanged
}
```

DOMPurify requires a DOM. In Node there is none, so **`sanitize: true` provides no
protection during SSR or static generation** despite the option reading as safe.

Consumers rendering untrusted markdown server-side must either install
`isomorphic-dompurify` and sanitize at the application layer, or render on the client.
This should be stated far more loudly in the README than it currently is — tracked in
[../tasks/ongoing/](../tasks/ongoing/).

---

## `generateCSS()`

```ts
generateCSS({ plugins, theme, wrapperClass, includeBase, syntaxTheme }): string
```

Concatenates three sources, in order:

1. **Base styles** — a small `.draftly-preview { padding: 0 0.5rem }` block, with the
   class name string-replaced if a custom `wrapperClass` was given.
2. **Syntax theme** — `generateSyntaxThemeCSS()` walks the supplied CodeMirror
   extension/`HighlightStyle` (up to `MAX_WALK_DEPTH = 8` levels of nested arrays),
   pulls each style's internal `StyleModule`, and emits its rules so `tok-*` classes
   resolve in static HTML.
3. **Plugin styles** — `plugin.getPreviewStyles(theme, wrapperClass)` for each plugin,
   each chunk preceded by a `/* name - version */` comment.

**`wrapperClass` must match between `preview()` and `generateCSS()`** or the output is
unstyled. This is the most common preview integration mistake.

### How editor styles become preview styles

`DraftlyPlugin.transformToCss` re-runs the plugin's theme object through `StyleModule`
with a `finish` hook:

```ts
new StyleModule(themeStyles, { finish: (sel) => `.${wrapperClass} ${sel}` });
```

So `.cm-draftly-h1` in the editor becomes `.draftly-preview .cm-draftly-h1` in the
preview. The plugin writes its styles **once**; both surfaces consume them. This only
works because `renderToHTML` emits the same class names the decorations use — which is
why plugins read class names off `Decoration.spec.class` rather than retyping them.

---

## `syntax-theme.ts`

The trickiest module in the package. CodeMirror's `HighlightStyle` does not expose its
generated CSS publicly, so this file reaches into runtime internals:

```ts
type RuntimeHighlightStyle = {
  specs?: HighlightSpec[];
  style?: (tags) => string | null;
  module?: { getRules(): string } | null;
};
```

It recursively unwraps arbitrarily nested `Extension` arrays (depth-capped at 8) looking
for objects shaped like a `HighlightStyle`, then:

- `generateSyntaxThemeCSS()` → collects `style.module.getRules()`, dedupes, joins.
- `resolveSyntaxHighlighters()` → collects objects with a callable `.style`, prepending
  `classHighlighter` so legacy `tok-*` classes keep working.

> **Fragility warning:** this depends on undocumented CodeMirror internals. A
> `@codemirror/language` upgrade can silently break preview syntax highlighting with no
> type error and no exception — the output simply loses colour. Re-test preview code
> blocks after any CodeMirror version bump. Extracted in `31791b8`.

---

## `default-renderers.ts`

Currently near-empty by design: only `Document` (renders children) is registered.
Everything else is a plugin's responsibility, and unmatched nodes fall through to the
recurse-or-slice fallback. `escapeHtml` lives here and is the module's main export in
practice.

Add a default renderer only for structural nodes that no plugin should own.
