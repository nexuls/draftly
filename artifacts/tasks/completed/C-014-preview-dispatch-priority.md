# C-014 — Preview plugin dispatch ignores `decorationPriority`

**Status:** Complete
**Priority:** Medium
**Created:** 2026-08-18
**Completed:** 2026-08-18

## Problem

The two surfaces resolve plugin conflicts differently.

**Editor** sorts by priority before invoking (`editor/view-plugin.ts:53`):

```ts
const sortedPlugins = [...plugins].sort((a, b) => a.decorationPriority - b.decorationPriority);
```

**Preview** uses array insertion order (`preview/renderer.ts:55-68`):

```ts
for (const plugin of this.plugins) {
  if (plugin.renderToHTML && plugin.requiredNodes.length > 0) {
    for (const nodeName of plugin.requiredNodes) {
      const list = map.get(nodeName) || [];
      list.push(plugin);       // ← order = order the consumer passed them in
```

and `renderNode` returns on the first plugin whose `renderToHTML` returns non-null
(`renderer.ts:107-109`).

So when two plugins claim the same node type, the editor picks by priority and the preview
picks by whatever order the consumer happened to write their array in. That directly
undercuts the architecture's central claim — that editor/preview parity is structural
rather than aspirational.

It is latent rather than active today: no two built-in plugins share a `requiredNodes`
entry. But `requiredNodes` overlap is exactly what a consumer adding a custom plugin to
override a built-in would do, and it is the natural way to extend the system. The bug
surfaces the first time someone tries.

There is a second, smaller inconsistency in the same area: `renderNode` treats `null` as
"decline, try the next", but the editor has no equivalent decline mechanism — a plugin's
`buildDecorations` either pushes decorations or does not, and all plugins always run. The
two surfaces have different composition models, not just different orderings.

## Proposed approach

1. **Sort by `decorationPriority` in `buildNodePluginMap`**, matching the editor. One line,
   and it makes the surfaces agree.
2. **Decide what priority means for rendering.** The editor's ordering is about
   *layering* — lower priority applies first, later decorations layer over earlier ones.
   Preview's is about *precedence* — first non-null wins. Those are not the same concept
   and reusing one number for both may be wrong. Either:
   - document that `decorationPriority` doubles as render precedence, and define the
     direction explicitly (lower wins? higher wins?); or
   - add a separate `renderPriority` defaulting to `decorationPriority`.
   *Recommendation: document the single field.* A second knob is more surface area for a
   problem no one has yet.
3. **Document the decline contract.** `renderToHTML` returning `null` meaning "let someone
   else handle it" is a real and useful mechanism that appears nowhere in the architecture
   docs. Plugin authors currently discover it by reading the renderer.
4. **Add a development-time warning** when two plugins claim the same node with equal
   priority — that is genuinely ambiguous and the author should know.

## Affected areas

- `preview/renderer.ts` — `buildNodePluginMap`
- `editor/plugin.ts` — `decorationPriority` JSDoc
- `artifacts/architecture/plugin-system.md` — priority bands, the decline contract
- `artifacts/architecture/preview-pipeline.md` — dispatch order
- `AGENTS.md` — the "pick within an existing band" instruction should say what the bands
  mean on both surfaces

## Acceptance

- [x] Two plugins claiming the same node resolve identically in editor and preview
- [x] The resolution rule is documented with its direction stated explicitly
- [x] Built-in plugin output is unchanged (no current overlap, so this should be a no-op)
- [x] Equal-priority conflicts warn in development
- [x] `null`-means-decline is documented

## Outcome

Landed as `fix(draftly): Resolve preview plugin conflicts by decorationPriority`.

Took the recommended option — **document the single field**, no second `renderPriority`
knob.

### The direction, and why it is not the editor's

`buildNodePluginMap` sorts candidates **descending**; the editor sorts **ascending**.
That looks like a bug and is not:

| Surface | Sort       | Composition                                  | Who wins        |
| ------- | ---------- | -------------------------------------------- | --------------- |
| Editor  | ascending  | every plugin runs; later layers over earlier | higher priority |
| Preview | descending | first non-null `renderToHTML` result is used | higher priority |

The sorts are inverse precisely so the *outcome* is identical. Working through it the
other way — matching the editor's ascending sort literally — would have made the
lowest-priority plugin win in preview and the highest win in the editor, which is the
original bug with extra steps.

This resolves the second inconsistency the task raised: the two surfaces genuinely have
different composition models (layering versus precedence), and one number can serve both
only if the sort compensates. Now documented as such rather than left implicit.

### No-op verified, not assumed

Per the task note, dumped `requiredNodes` across all plugins before shipping: **52 node
names, zero overlaps**, so built-in output cannot change. Confirmed by diffing rendered
output for a mixed document.

The same dump also confirmed that no plugin now has `renderToHTML` without `requiredNodes`
— `HTMLPlugin` was the last one, fixed in C-012.

### Regression case

The fixture the task suggested was built as a scratch harness: a custom plugin claiming
`ATXHeading1` at priority 999 alongside `HeadingPlugin`. It now wins **regardless of array
order**; before, writing it after `HeadingPlugin` lost. This is the first thing to turn
into a real test under T-001.

### Also

`null`-means-decline is documented on `renderToHTML`'s JSDoc and in `plugin-system.md`,
including the distinction from `""` (render as nothing), which was previously discoverable
only by reading the renderer.

## Notes

- Verify the no-op claim before shipping: dump `requiredNodes` across all 14 plugins and
  confirm there is genuinely no overlap. If there is, this task is not a no-op and the
  behaviour change needs its own analysis.
- Worth writing the regression case as the first preview test under T-001 — a custom
  plugin overriding `HeadingPlugin` on `ATXHeading1` is a two-line fixture that would have
  caught this.
