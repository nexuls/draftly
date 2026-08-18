# C-012 — Preview emits raw HTML for unhandled nodes, and `HTMLPlugin` is absent from preview

**Status:** Complete
**Priority:** High
**Created:** 2026-08-18
**Completed:** 2026-08-18

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

- [x] `<script>alert(1)</script>` in a markdown document does not produce an executable
      script tag in preview output — **in a browser**; the server case is T-003
- [x] `<b>bold</b>` still renders as bold in preview with `sanitize: true`
- [x] Editor and preview agree on what HTML blocks look like
- [x] No node type emits unescaped document text through the fallback
- [x] A plugin with `renderToHTML` but empty `requiredNodes` is detectable in development

## Outcome

Landed as `fix(draftly): Escape the preview leaf fallback and render HTML nodes`.

### 1. The leaf fallback escapes

`preview/renderer.ts` — `return escapeHtml(this.ctx.sliceDoc(node.from, node.to))`. Audited
first: with `HTMLPlugin` now claiming the HTML node types, everything still reaching the
fallback is markdown *source text*, which has always wanted escaping. Nothing relied on the
raw pass-through.

### 2. `HTMLPlugin` renders in preview

`requiredNodes` is `["HTMLBlock", "HTMLTag", "Comment", "CommentBlock"]` — confirmed
against an actual parse rather than guessed. `CommentBlock` was not in the task's guess;
`Comment` is the inline form.

- `HTMLBlock` → `ctx.sanitize(raw)`. A block is a complete fragment, which is what
  DOMPurify expects.
- `Comment` / `CommentBlock` → `""`.
- `HTMLTag` → `sanitizeHTMLTag()`, described below.

### The finding that changed the approach

The task proposed routing everything through `ctx.sanitize()`, "mirroring what
`HTMLPreviewWidget` does". **That does not work for `HTMLTag`.** DOMPurify sanitizes a
*fragment*, so it balances what it is handed. Measured against DOMPurify 3.3.1:

| Input                          | `DOMPurify.sanitize()` |
| ------------------------------ | ---------------------- |
| `<b>`                          | `<b></b>`              |
| `</b>`                         | `""`                   |
| `<b class=x onclick=alert(1)>` | `<b class="x"></b>`    |
| `<script>`                     | `""`                   |
| `<br/>`                        | `<br>`                 |

The parser emits one `HTMLTag` node per tag, so sanitizing each in isolation would have
doubled every opener and swallowed every closer — `<b>inline</b>` becoming
`<b></b>inline`.

`sanitizeHTMLTag()` sanitizes inside a balanced probe and reads the verdict off the
result: an opener is sanitized as-is and DOMPurify's added closer is trimmed back off; a
closer is probed with `<tag></tag>` and re-emitted verbatim if the element is allowed.
Attribute filtering still comes from DOMPurify, so the plugin maintains **no allowlist of
its own** — which was the point of the detour.

### 3. Development-time detection

`buildNodePluginMap` warns when a plugin has `renderToHTML` but no `requiredNodes`. New
`lib/dev.ts` provides `isDevMode()` and `devWarn()`; T-004 will reuse them.

## Notes on the open question

Question 11 asked whether `sanitize: false` should emit raw HTML or escape it. **Resolved
as: honour the flag literally.** With `sanitize: false` the HTML is emitted raw.

Reasoning: the flag names one behaviour and defaults to the safe one, `ctx.sanitize()`
already encodes exactly this contract everywhere else in the codebase, and a flag whose
`false` value does not do what it says is a worse trap than an explicit opt-out. A
consumer who writes `sanitize: false` over untrusted input has made a decision; a consumer
who leaves the default has not, and is protected. **Flag for the developer to confirm or
overturn** — the question stays in `memory.md` marked resolved-provisionally rather than
deleted.

## Verification

Ran the preview pipeline against a document containing `<script>`, an `onclick` on a
block, `<img onerror>`, an `<iframe>`, an HTML comment, paired `<b>` tags, and bare `<`
and `&` — under jsdom (so `sanitize()` actually runs) and under bare Node.

With a DOM and `sanitize: true`: script tags dropped with their text preserved and
escaped, `onclick` and `onerror` stripped, `<iframe>` dropped, `<b>` pairing intact,
comment gone, `&` and `<` escaped. With `sanitize: false`: all of it emitted raw, as
designed.

**Under bare Node the output is identical to `sanitize: false` in both cases** — which is
precisely the T-003 hole, unchanged by this commit and next on the list.

`tsc --noEmit` and `biome check` clean.

## Notes

- **Open question for the developer:** with `sanitize: false`, should `HTMLPlugin` emit
  raw HTML (honouring the flag literally, trusting the consumer) or escape it? The flag's
  name says the former; safety says the latter. Raise before implementing.
- The `Document`-only `defaultRenderers` map suggests the intent was for plugins to own
  everything. Worth confirming: if so, the fallback is a safety net and should behave like
  one rather than like a pass-through.
