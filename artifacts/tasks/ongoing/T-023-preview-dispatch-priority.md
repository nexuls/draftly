# T-023 — Preview plugin dispatch ignores `decorationPriority`

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** —

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

- [ ] Two plugins claiming the same node resolve identically in editor and preview
- [ ] The resolution rule is documented with its direction stated explicitly
- [ ] Built-in plugin output is unchanged (no current overlap, so this should be a no-op)
- [ ] Equal-priority conflicts warn in development
- [ ] `null`-means-decline is documented

## Notes

- Verify the no-op claim before shipping: dump `requiredNodes` across all 14 plugins and
  confirm there is genuinely no overlap. If there is, this task is not a no-op and the
  behaviour change needs its own analysis.
- Worth writing the regression case as the first preview test under T-001 — a custom
  plugin overriding `HeadingPlugin` on `ATXHeading1` is a two-line fixture that would have
  caught this.
