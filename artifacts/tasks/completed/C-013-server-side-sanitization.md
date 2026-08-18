# C-013 — Make server-side sanitization honest

**Status:** Complete
**Priority:** High
**Created:** 2026-08-18
**Completed:** 2026-08-18

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

- [x] Server-side use with `sanitize: true` produces a visible, actionable warning
- [x] README states the limitation where consumers will actually read it
- [x] A custom sanitizer can be injected without Draftly depending on jsdom
- [x] `preview-pipeline.md` reflects the final behaviour

## Outcome

Landed as `fix(draftly): Warn on server-side sanitization and accept a sanitizer`.
All three proposed approaches shipped together, since 1 and 2 are worth having alongside 3.

`preview/context.ts` now resolves in a fixed order:

```
sanitize: false        -> return html unchanged (the consumer opted out)
config.sanitizer given -> sanitizer(html)         (works everywhere)
a DOM is present       -> DOMPurify.sanitize(html)
otherwise              -> warn once, return html unchanged
```

- **`PreviewConfig.sanitizer`** — `(html: string) => string`, threaded through `preview()`
  and `PreviewRenderer` (an optional 7th positional parameter; additive). It takes
  precedence over the bundled DOMPurify on every surface, not just the server, so a
  consumer with a stricter policy can apply it uniformly.
- **The warning** fires once per process, not once per call. A static-site build renders
  thousands of documents and a per-node warning would be scrolled past rather than read.
- **No jsdom.** Explicitly rejected in the task and not reconsidered.
- `hasDOM()` now also checks `window.document`, not just `window` — a partial `window`
  shim is a real pattern in SSR frameworks and would have crashed DOMPurify.

Also escaped `wrapperClass` where `preview()` interpolates it into the wrapper tag. It is
developer-supplied rather than untrusted, so this is tidiness rather than a fix.

**Verified** in bare Node: the warning fires once and not twice, `sanitize: false` stays
silent, and an injected jsdom-backed DOMPurify strips `<script>` and `onclick` in a real
server-side render — confirming the option actually closes the gap rather than only
documenting it.

## Notes on what was deliberately left

- **Pass-through is unchanged when no sanitizer is supplied.** Escaping instead would make
  the default safe everywhere, but it would also break every working SSR setup — HTML
  blocks would start rendering as visible escaped source. That is a behaviour change and
  the developer's call, so it is logged as open question 14 rather than taken.
- `sanitize: true` as the default likewise stays; changing it is breaking.
- `ctx.sanitize()` remains **opt-in per plugin** rather than a pass over the finished
  document. That is the last structural piece of the original framing and is not fixed
  here; with C-011 and C-012 landed, every built-in plugin's output is accounted for, but
  a third-party plugin that emits markup without sanitizing still can.
- `TablePlugin.createPreviewRenderer` builds a nested `PreviewRenderer` with `sanitize`
  hardcoded to `true` and no way to pass a `sanitizer` through — it reads from
  `DraftlyConfig`, which has no such field. Table cells containing raw HTML therefore do
  not inherit the consumer's sanitizer. Narrow enough to leave; noted here so it is not
  rediscovered as a surprise.

## Notes

- Ships as its own commit, separate from the broader README audit in T-002.
- **2026-08-18:** scope narrowed after the codebase audit — see the revised-scope section
  above. Sequence after T-010, which is the higher-severity half: an injected sanitizer
  has nothing to protect while the renderer emits raw text on its own fallback path.
- The injected-sanitizer option (approach 3) is also what makes T-010's `HTMLPlugin`
  renderer safe server-side, so the two designs should be agreed together.
