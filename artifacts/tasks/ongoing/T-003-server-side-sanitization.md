# T-003 — Make server-side sanitization honest

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
**Blocked on:** —

## Problem

`preview/context.ts` implements `sanitize()` as:

```ts
sanitize(html) {
  if (!sanitizeHtml) return html;
  if (typeof window !== "undefined") return DOMPurify.sanitize(html);
  return html;   // server-side: unchanged
}
```

DOMPurify needs a DOM, so outside a browser the function returns its input untouched.
`sanitize` defaults to `true`, and the README presents it as "Sanitize HTML output (via
DOMPurify)". A consumer rendering untrusted markdown during SSR or static generation gets
**no sanitization at all** while every signal tells them they are protected.

This is a security-relevant default that reads as safe and is not.

The existing source comment acknowledges it ("user should sanitize at application level")
but a code comment is not where a consumer looks.

### Revised scope (2026-08-18 audit)

The original framing — "`HTMLPlugin` is what passes raw content through" — was wrong in a
way that matters. The audit found the gap is **structural, not server-specific**:

- `ctx.sanitize()` is **opt-in per plugin**, not a pass over the finished document.
  Nothing sanitizes the renderer's own output, so `sanitize: true` makes a document-level
  promise the pipeline never keeps — in the browser as much as on the server.
- `HTMLPlugin` has neither `requiredNodes` nor `renderToHTML`, so HTML nodes never reach a
  plugin at all. They hit the renderer's leaf fallback (`renderer.ts:125`), which returns
  `sliceDoc()` **unescaped**. Tracked as **T-010**.
- Where plugins do call `sanitize()`, several use it on attribute *values*, which DOMPurify
  does not protect. Tracked as **T-009**.

So this task narrows to what its title says: making the server-side no-op honest. The two
client-side halves are T-009 and T-010, and **both must land for `sanitize: true` to mean
anything**. Fixing only this one yields a correctly-warned pipeline that is still unsafe.

## Proposed approach

Make the gap impossible to miss without breaking working setups. In order of preference:

1. **Warn loudly, once.** When `sanitize: true` and there is no DOM, emit a single
   `console.warn` naming the risk and the remedy (`isomorphic-dompurify`, or sanitize at
   the application layer). Cheap, non-breaking, and lands where developers will see it.
2. **Document it prominently** — a call-out box in the README's preview section and in
   the `PreviewConfig` table's `sanitize` row, not a footnote.
3. **Accept an injected sanitizer.** Add `sanitizer?: (html: string) => string` to
   `PreviewConfig`, letting consumers supply `isomorphic-dompurify` or DOMPurify with
   jsdom without Draftly taking the dependency. This is the real fix; 1 and 2 remain
   worthwhile alongside it.

Explicitly **not** proposed: bundling jsdom. It is heavy, and forcing it on every
consumer to serve the server-rendering subset is the wrong trade.

Consider whether `sanitize: true` should even be the default given it cannot honour the
promise everywhere — but changing the default is a breaking change and needs the
developer's call.

## Affected areas

- `preview/context.ts` — warning and/or injected sanitizer
- `preview/types.ts` — `PreviewConfig.sanitizer`
- `preview/preview.ts` — thread the option through
- `README.md` — the call-out
- `artifacts/architecture/preview-pipeline.md` — update the caveat section

## Acceptance

- [ ] Server-side use with `sanitize: true` produces a visible, actionable warning
- [ ] README states the limitation where consumers will actually read it
- [ ] A custom sanitizer can be injected without Draftly depending on jsdom
- [ ] `preview-pipeline.md` reflects the final behaviour

## Notes

- Ships as its own commit, separate from the broader README audit in T-002.
- **2026-08-18:** scope narrowed after the codebase audit — see the revised-scope section
  above. Sequence after T-010, which is the higher-severity half: an injected sanitizer
  has nothing to protect while the renderer emits raw text on its own fallback path.
- The injected-sanitizer option (approach 3) is also what makes T-010's `HTMLPlugin`
  renderer safe server-side, so the two designs should be agreed together.
