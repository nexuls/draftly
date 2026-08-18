# T-009 — Escape and validate attribute values in `renderToHTML`

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
**Blocked on:** —

## Problem

`link-plugin.ts:315` and `image-plugin.ts:337` build HTML attributes by interpolating
`ctx.sanitize(value)` into a quoted attribute:

```ts
const urlAttr = ctx.sanitize(parsed.url);
const titleAttr = parsed.title ? ` title="${ctx.sanitize(parsed.title)}"` : "";
return `<a class="cm-draftly-link" href="${urlAttr}"${titleAttr} target="_blank" rel="noopener noreferrer">${textContent}</a>`;
```

`DOMPurify.sanitize()` sanitizes an HTML **fragment**. Handed a bare string containing no
tags it returns that string essentially unchanged — double quotes included. So it does
nothing at all for the job being asked of it here.

Two consequences:

1. **Attribute injection.** The markdown `[x](" onmouseover="alert(1))` produces
   `href="" onmouseover="alert(1)"`. The same applies to `title` on both plugins, and to
   `alt`, `src` and `aria-label` on the image plugin.
2. **Dangerous URL schemes pass through.** `[x](javascript:alert(1))` emits a live
   `href="javascript:alert(1)"`. DOMPurify would strip this if it were parsing an anchor
   element, but it never sees one — only the URL string.

`escapeHtml` already exists in `preview/default-renderers.ts:6` and escapes `&`, `<`, `>`,
`"` and `'` — it is exactly the right function and is currently used nowhere outside the
renderer's text-gap handling.

Note this is independent of T-003: it is broken in the browser too, where `sanitize()`
does run.

## Proposed approach

1. **Export `escapeHtml` from the preview barrel and use it for every attribute value.**
   `sanitize()` stays for the one thing it is good at — scrubbing an HTML *fragment*, as
   `HTMLPlugin` does. Attribute values are text, and text gets escaped.
2. **Add a URL-scheme guard** as a small shared helper (`preview/url.ts` or
   `lib/safe-url.ts`). Allowlist `http:`, `https:`, `mailto:`, `tel:` and protocol-relative
   / relative URLs; reject `javascript:`, `data:` (except `data:image/*` for `src`, which
   the image plugin legitimately needs), and `vbscript:`. Resolve with the URL parser
   rather than a regex where possible, and strip control characters and whitespace before
   testing — `java\nscript:` is a real bypass.
3. **Audit every other `renderToHTML`** for the same shape. `code-plugin.ts:778`,
   `table-plugin.ts:873`, `mermaid-plugin.ts:345` and `math-plugin.ts:405` all emit
   attributes; confirm each escapes rather than sanitizes.
4. **Apply the same guard in the editor surface** — `ImageWidget.toDOM` sets
   `img.src = this.url` (`image-plugin.ts:96`) and `LinkTooltipWidget` calls
   `window.open(this.url, ...)` (`link-plugin.ts:80`) with no validation. Setting DOM
   properties avoids the injection problem but not the scheme problem.

Explicitly **not** proposed: making `sanitize()` smarter. Escaping and sanitizing are
different operations and conflating them is what produced this bug.

## Affected areas

- `preview/default-renderers.ts` — export `escapeHtml`
- `preview/index.ts` — barrel export
- new `lib/safe-url.ts` (or `preview/url.ts`) — scheme allowlist, pure and testable
- `plugins/link-plugin.ts` — `renderToHTML`, `LinkTooltipWidget.toDOM`
- `plugins/image-plugin.ts` — `renderToHTML`, `ImageWidget.toDOM`
- all remaining `renderToHTML` implementations — audit pass
- `artifacts/architecture/preview-pipeline.md` — document the escape-vs-sanitize rule
- `artifacts/architecture/plugin-system.md` — add it to the plugin authoring checklist

## Acceptance

- [ ] `[x](" onmouseover="alert(1))` renders an inert `href`, no extra attribute
- [ ] `[x](javascript:alert(1))` renders without a live `javascript:` URL
- [ ] Equivalent cases for `title`, `alt` and `aria-label` on images
- [ ] `data:image/png;base64,...` still works as an image `src`
- [ ] Quotes and angle brackets in link text and titles round-trip visibly correct
- [ ] Editor surface rejects the same schemes as preview
- [ ] Plugin authoring checklist states: attributes are escaped, fragments are sanitized

## Notes

- The scheme guard is pure and CodeMirror-free, so it belongs in `lib/` and is a good
  early test target for T-001.
- Ships separately from T-010 — that one is about the renderer's fallback path, this one
  is about plugin output. Related symptom, different mechanism, two commits.
