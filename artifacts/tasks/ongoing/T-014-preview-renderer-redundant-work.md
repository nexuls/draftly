# T-014 — Eliminate redundant work in the preview renderer

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** —

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

- [ ] Each node's children are rendered at most once
- [ ] Output is byte-identical to current output for the walkthrough document
- [ ] The parser is constructed once for repeated `preview()` calls with the same plugins
- [ ] A nested-table document renders measurably faster; number recorded in Notes
- [ ] Playground HTML pane output unchanged

## Notes

- Byte-identical output is the key acceptance criterion — this is pure optimisation and
  any diff means something else changed. Capture the current output of both seed documents
  before starting.
- Parser caching interacts with T-017: if plugin instances stop being singletons, the
  cache key must be the extension set, not the plugin array identity.
