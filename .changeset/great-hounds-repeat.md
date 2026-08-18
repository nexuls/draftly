---
"draftly": patch
---

Stop preview from emitting raw HTML for unhandled nodes.

`HTMLPlugin` declared neither `requiredNodes` nor `renderToHTML`, and `requiredNodes` is
the preview dispatch key — so `HTMLBlock` and `HTMLTag` nodes fell through to the
renderer's leaf fallback, which returned document source **unescaped**.
`<script>alert(1)</script>` written in a markdown document became a live script tag in
preview output regardless of the `sanitize` setting, while the editor surface sanitized it
correctly. Both halves are fixed:

- The renderer's leaf fallback now escapes. It is a safety net, not a pass-through.
- `HTMLPlugin` renders on the preview surface, honouring `sanitize`. Blocks go through
  DOMPurify directly; individual tags go through a balanced probe, because DOMPurify
  balances the fragment it is given and would otherwise turn `<b>` into `<b></b>` and
  swallow every `</b>`. HTML comments render as nothing.

In development, a plugin that defines `renderToHTML()` but declares no `requiredNodes` now
warns on the console instead of being silently absent from preview.

Note this closes the client-side hole only. `sanitize()` still no-ops outside a browser.
