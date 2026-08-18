# T-010 — Preview emits raw HTML for unhandled nodes, and `HTMLPlugin` is absent from preview

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
**Blocked on:** —

## Problem

Two defects that combine into one hole. Either alone is a bug; together they mean a
markdown document can inject arbitrary HTML into preview output regardless of the
`sanitize` setting.

### 1. The renderer's leaf fallback emits document text unescaped

`preview/renderer.ts:118-126`:

```ts
// Unknown node - render children or text
if (node.firstChild) {
  return await this.renderChildren(node);
}

// Leaf node - return text content
return this.ctx.sliceDoc(node.from, node.to);   // ← raw
```

`escapeHtml` is applied to the *gap* text between children (`renderer.ts:139` and `:150`)
but never to a leaf node's own text. Any node type with no plugin and no default renderer
therefore has its source text spliced into the output verbatim.

`defaultRenderers` currently contains exactly one entry — `Document`
(`default-renderers.ts:26`) — so the fallback is not an edge case. It is the path most
node types take.

### 2. `HTMLPlugin` declares neither `requiredNodes` nor `renderToHTML`

It is the only plugin with both missing. `requiredNodes` defaults to `[]`, which is the
preview dispatch key, so `HTMLBlock` and `HTMLTag` nodes reach the fallback above and are
emitted as-is. `<script>alert(1)</script>` written in a markdown document lands in the
preview output unmodified.

The editor surface handles this correctly — `HTMLPreviewWidget.toDOM` runs
`DOMPurify.sanitize()` (`html-plugin.ts:38`). So this is also a parity break: the two
surfaces disagree on the one node type where the disagreement is dangerous.

### Why `sanitize: true` does not save this

`ctx.sanitize()` is **opt-in per plugin** — a utility plugins may call, not a pass over
the finished document. Nothing sanitizes the renderer's own fallback output. The
`sanitize` option therefore makes a document-level promise the pipeline does not keep,
on the client as much as the server. T-003 covers the server-side half of that story;
this task covers the structural half.

## Proposed approach

The two halves must land together — escaping the fallback without giving `HTMLPlugin` a
renderer would turn HTML blocks into visible escaped source, which is a regression in
behaviour even though it is an improvement in safety.

1. **Escape the leaf fallback.** `return escapeHtml(this.ctx.sliceDoc(node.from, node.to))`.
   Audit whether any current plugin relies on raw pass-through before changing it.
2. **Give `HTMLPlugin` `requiredNodes` and `renderToHTML`.** `requiredNodes` should list
   whatever the markdown parser actually produces — confirm against the tree rather than
   guessing; `HTMLBlock` and `HTMLTag` are the expected names. `renderToHTML` should route
   through `ctx.sanitize()`, mirroring what `HTMLPreviewWidget` does in the editor.
3. **Decide the policy when sanitization is unavailable.** With `sanitize: false`, or
   server-side where `sanitize()` no-ops (T-003), `HTMLPlugin` is knowingly emitting
   untrusted HTML. That is a legitimate choice for trusted input, but it should be the
   consumer's explicit choice. Escaping rather than emitting is the safe default; see the
   open question below.
4. **Consider a defence in depth**: assert in development that no node type reaches the
   fallback while carrying markup characters, so the next plugin added without
   `requiredNodes` is noisy rather than silent. This is the same class of failure the
   memory file already flags as the system's sharpest edge.

## Affected areas

- `preview/renderer.ts` — the leaf fallback
- `preview/default-renderers.ts` — possibly more default renderers so fewer nodes fall through
- `plugins/html-plugin.ts` — `requiredNodes`, `renderToHTML`
- `artifacts/architecture/preview-pipeline.md` — the fallback path is currently documented
  as inert; it is not
- `artifacts/architecture/plugins-catalog.md` — the `HTMLPlugin` row
- `artifacts/memory.md` — the `requiredNodes` trap now has a live example worth naming

## Acceptance

- [ ] `<script>alert(1)</script>` in a markdown document does not produce an executable
      script tag in preview output
- [ ] `<b>bold</b>` still renders as bold in preview with `sanitize: true`
- [ ] Editor and preview agree on what HTML blocks look like
- [ ] No node type emits unescaped document text through the fallback
- [ ] A plugin with `renderToHTML` but empty `requiredNodes` is detectable in development

## Notes

- **Open question for the developer:** with `sanitize: false`, should `HTMLPlugin` emit
  raw HTML (honouring the flag literally, trusting the consumer) or escape it? The flag's
  name says the former; safety says the latter. Raise before implementing.
- The `Document`-only `defaultRenderers` map suggests the intent was for plugins to own
  everything. Worth confirming: if so, the fallback is a safety net and should behave like
  one rather than like a pass-through.
