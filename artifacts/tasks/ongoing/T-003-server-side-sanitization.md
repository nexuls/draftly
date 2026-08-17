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

This is a security-relevant default that reads as safe and is not. The affected path is
`HTMLPlugin`, which is what passes raw `HTMLBlock`/`HTMLTag` content through.

The existing source comment acknowledges it ("user should sanitize at application level")
but a code comment is not where a consumer looks.

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
