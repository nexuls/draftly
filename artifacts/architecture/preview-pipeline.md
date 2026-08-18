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
| `default-renderers.ts` | 23  | Fallback renderers; re-exports `escapeHtml` from `lib/`     |
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
| `sanitize`     | `true`              | Browser-only unless `sanitizer` is given       |
| `sanitizer`    | `undefined`         | Consumer-supplied; required for SSR            |
| `theme`        | `AUTO`              |                                                |
| `syntaxTheme`  | `undefined`         | A CodeMirror theme/`HighlightStyle` for code   |

---

## `PreviewRenderer` — the walk

### Construction

```ts
new PreviewRenderer(doc, plugins, markdownConfigs, theme, sanitize, syntaxTheme, sanitizer);
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
4. leaf                          → return escapeHtml(ctx.sliceDoc(node.from, node.to))
```

Candidates for a node are ordered by **descending `decorationPriority`**, matching the
editor's resolution (see [plugin-system.md](./plugin-system.md#choosing-decorationpriority)).
Before C-014 they were in the order the consumer passed them, which is only invisible
because no two built-ins share a `requiredNodes` entry — verified, 52 node names, zero
overlaps. A consumer adding a plugin to override a built-in is exactly the case that broke.

Note the cost in step 1: `renderChildren` is awaited **before** the plugin is consulted,
once per candidate plugin. A plugin that returns `null` has already paid for a full
subtree render. This is why plugins should decline via `requiredNodes` (never registering
for the node) rather than via a `null` return where possible.

Step 4 **escapes** the leaf node's text (since C-012). It is a safety net, not a
pass-through: `defaultRenderers` holds only `Document`, so most node types reach this
line, and returning document source unescaped was how raw HTML entered the output. A
plugin that genuinely needs to emit markup does so from `renderToHTML`, where the decision
is explicit and visible.

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
**Gaps are always HTML-escaped, and so is the leaf fallback. A plugin's `renderToHTML`
output is the only thing emitted unescaped** — because that is the one place where
emitting markup is the stated intent.

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

### ⚠️ Escaping and sanitizing are not interchangeable

The rule, in one line: **attribute values and text get `escapeHtml`; HTML fragments get
`ctx.sanitize()`.**

`DOMPurify.sanitize()` parses an HTML *fragment* and removes what is dangerous in it.
Handed a bare string with no tags — a URL, a title, an alt text — it has nothing to parse
and returns the string essentially unchanged, double quotes included. So
`href="${ctx.sanitize(url)}"` is not protection; it is a no-op wearing protection's
clothes, and `[x](" onmouseover="alert(1))` walked straight through it (C-011).

`escapeHtml` now lives in `lib/escape-html.ts` and is re-exported here, so plugins can
reach it without importing the preview pipeline. `lib/safe-url.ts` covers the other half
— DOMPurify would strip `javascript:` off an anchor element, but it never sees one, only
the URL string. Both surfaces call the same guard.

### ⚠️ `sanitize()` is a no-op on the server

Resolution order, in `preview/context.ts`:

```
sanitize: false        → return html unchanged (the consumer opted out)
config.sanitizer given → sanitizer(html)         (works everywhere)
a DOM is present       → DOMPurify.sanitize(html)
otherwise              → warn once, return html unchanged
```

DOMPurify requires a DOM, so in Node there is nothing it can do. **`sanitize: true`
provides no protection during SSR or static generation** — the option reads as safe and
is not.

Since C-013 that failure is loud rather than silent: a single `console.warn` per process
names the risk and the remedy. The remedy is `PreviewConfig.sanitizer`, which takes a
consumer-supplied function (`isomorphic-dompurify`, or DOMPurify with jsdom) and is used
in preference to the bundled one on every surface, browser included.

Draftly deliberately does **not** bundle jsdom. It is heavy, and forcing it on every
browser consumer to serve the server-rendering subset is the wrong trade.

The pass-through behaviour when no sanitizer is supplied is unchanged — escaping instead
would break working SSR setups, and changing that default is the developer's call. It is
open question 14 in [`../memory.md`](../memory.md#open-questions-for-the-developer).

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
recurse-or-slice fallback. `escapeHtml` is **re-exported** from here — it moved to
`lib/escape-html.ts` in C-011 so plugins could use it without depending on the preview
pipeline — and the re-export keeps the public `draftly/preview` entry point unchanged.

Add a default renderer only for structural nodes that no plugin should own.
