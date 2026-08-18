# C-015 — Eliminate redundant work in the preview renderer

**Status:** Complete
**Priority:** Medium
**Created:** 2026-08-18
**Completed:** 2026-08-18

## Problem

Two independent sources of wasted work in `preview/renderer.ts`, both on the render path.

### 1. Subtrees are rendered more than once per node

`renderer.ts:100-117`:

```ts
const plugins = this.nodeToPlugins.get(node.name);
if (plugins) {
  for (const plugin of plugins) {
    const children = await this.renderChildren(node);      // inside the loop
    const result = await plugin.renderToHTML!(node, children, this.ctx);
    if (result !== null) return result;
  }
}

const renderer = this.renderers[node.name];
if (renderer) {
  const children = await this.renderChildren(node);        // again
  return renderer(node, children, this.ctx);
}
```

Children are re-rendered once per candidate plugin, and again if every plugin declines.
`renderNode` recurses, so the duplication compounds multiplicatively with depth — table
nodes nest three deep (`Table` → `TableRow` → `TableCell`, all in `TablePlugin`'s
`requiredNodes`), and any node where a plugin returns `null` doubles the subtree cost at
that level.

Separately, `children` is computed **eagerly** for plugins that do not use it.
`LinkPlugin`, `ImagePlugin`, `HRPlugin`, `CodePlugin` and `TablePlugin` all take
`_children` — their entire subtree is rendered and immediately discarded.

### 2. The markdown parser is rebuilt on every call

`renderer.ts:76-87` constructs the full language support per render:

```ts
const markdownSupport = markdown({
  base: markdownLanguage,
  codeLanguages: languages,   // the whole @codemirror/language-data registry
  extensions,
  ...
});
```

`preview()` creates a fresh `PreviewRenderer` each call (`preview.ts:36`), so this runs
per render. In the playground that is every debounced keystroke while the preview pane is
open (`apps/web/app/playground/page.tsx:322`).

## Proposed approach

1. **Render children once, lazily.** Compute at most one `children` value per node, memoized,
   and only when something actually asks for it:
   ```ts
   let children: string | undefined;
   const getChildren = async () => (children ??= await this.renderChildren(node));
   ```
   The plugin signature takes `children` as a string, so either resolve it once before the
   loop (simple, still eager) or change the hook to accept a thunk (optimal, breaking).
   *Recommendation: resolve once before the loop.* It fixes the compounding problem
   entirely and needs no API change; the eager-but-unused case is a constant factor, not a
   multiplier, and can be revisited separately.
2. **Cache the parser.** Key on the resolved extension array identity, module-level. The
   extension set is stable across renders in every realistic usage.
3. **While in there:** `escapeHtml` (`default-renderers.ts:6`) chains five `.replace`
   calls, building four intermediate strings per invocation, on a function called for every
   text gap in the document. Single-pass regex with a lookup map.

## Affected areas

- `preview/renderer.ts` — `renderNode`, `render`
- `preview/default-renderers.ts` — `escapeHtml`
- `artifacts/architecture/preview-pipeline.md` — dispatch and caching behaviour

## Acceptance

- [x] Each node's children are rendered at most once
- [x] Output is byte-identical to current output for the walkthrough document
- [x] The parser is constructed once for repeated `preview()` calls with the same plugins
- [x] A nested-table document renders measurably faster; number recorded below
- [x] Playground HTML pane output unchanged — verified via the seed documents it renders

## Outcome

Landed as `perf(draftly): Render preview children once and cache the parser`.

### Measurements

Mean over 20 renders after a warm-up, `bun` on the seed documents:

| Document                 | Before     | After      | Change |
| ------------------------ | ---------- | ---------- | ------ |
| `walkthrough.ts`         | 25.15 ms   | 20.32 ms   | −19%   |
| 20 GFM tables            | 4.54 ms    | 3.89 ms    | −14%   |

The parser cache is most of it. The children fix is worth more on deeply nested input than
these documents contain.

### 1. Children rendered once

Took the recommended option — resolve before the loop, no API change — but implemented it
as a memoizing `getChildren()` thunk rather than an unconditional call. That also fixes
the *eager* half the task listed as a separate constant-factor problem: `LinkPlugin`,
`ImagePlugin`, `HRPlugin`, `CodePlugin` and `TablePlugin` all take `_children`, and for a
node only they claim, the subtree is now never rendered at all.

So both halves landed, without the breaking thunk-in-the-signature change the task
considered.

### 2. Parser cached

Single-entry, module-level, compared element-wise against the resolved extension array.

The obstacle: `getMarkdownConfig()` returns a **fresh object literal on every call** in
every plugin that implements it, so the extension array had no stable identity to compare.
New `editor/markdown-cache.ts` memoizes it per plugin instance — mirroring
`editor/theme-cache.ts` from C-010 — which is what makes the array comparison work at all.
`draftly()` was not switched over; it runs once per editor and gains nothing.

One entry rather than a keyed map, because realistic usage renders many documents against
one stable plugin set. Alternating between two plugin sets falls back to the old cost
rather than misbehaving.

Per the task note about T-017: the key is the **extension set**, not the plugin array, so
this survives plugin instances ceasing to be singletons.

### 3. `escapeHtml` single-pass

One regex with a lookup map, replacing five chained `.replace` calls and their four
intermediate strings.

Note for anyone optimising further: the pattern is `/g`, so do **not** add a
`.test()`-based fast path on the same instance. A global regex carries `lastIndex`, and
`.test()` advances it — the next call would start matching from the wrong offset. Written
into the JSDoc at the constant.

## Notes

- Byte-identical output is the key acceptance criterion — this is pure optimisation and
  any diff means something else changed. Capture the current output of both seed documents
  before starting.
- Parser caching interacts with T-017: if plugin instances stop being singletons, the
  cache key must be the extension set, not the plugin array identity.
