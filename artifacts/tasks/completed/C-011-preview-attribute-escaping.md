# C-011 — Escape and validate attribute values in `renderToHTML`

**Status:** Complete
**Priority:** High
**Created:** 2026-08-18
**Completed:** 2026-08-18

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

- [x] `[x](" onmouseover="alert(1))` renders an inert `href`, no extra attribute
- [x] `[x](javascript:alert(1))` renders without a live `javascript:` URL
- [x] Equivalent cases for `title`, `alt` and `aria-label` on images
- [x] `data:image/png;base64,...` still works as an image `src`
- [x] Quotes and angle brackets in link text and titles round-trip visibly correct
- [x] Editor surface rejects the same schemes as preview
- [x] Plugin authoring checklist states: attributes are escaped, fragments are sanitized

## Outcome

Landed as `fix(draftly): Escape attributes and reject unsafe URL schemes`.

**New `lib/safe-url.ts`** — `isSafeUrl(url, options)` and `safeUrl(url, options)`, pure and
CodeMirror-free. Allowlist is `http:`, `https:`, `mailto:`, `tel:` plus schemeless URLs
(relative, protocol-relative, fragment, query). Control characters, spaces and the C1 range
are stripped *before* the scheme is matched, so a newline spliced into `javascript:` does
not slip past. `allowDataImages` opts an `<img src>` into raster `data:` URLs;
`image/svg+xml` is excluded, since SVG carries script.

**New `lib/escape-html.ts`** — `escapeHtml` moved out of `preview/default-renderers.ts`.
Two plugins now need it, and a plugin importing from the preview pipeline for a pure string
utility is the wrong dependency direction. `preview/default-renderers.ts` re-exports it, so
the public `draftly/preview` export is unchanged.

**`link-plugin.ts` / `image-plugin.ts`** — every attribute value goes through `escapeHtml`;
every URL goes through `safeUrl`. `ctx.sanitize` no longer appears in either `renderToHTML`.

**Editor surface** — `ImageWidget.toDOM` guards `img.src`, and the Ctrl+Click handler in
both `LinkTooltipWidget` and `LinkTextWidget` guards `window.open`. Setting a DOM property
was never an injection risk, but it was a scheme risk.

**Audit of the remaining `renderToHTML` implementations** (proposal item 3) — clean:

| Plugin  | Finding                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| code    | Already had private `escapeHtml` / `escapeAttribute`; correct                  |
| table   | Emits only literal class names; cell content routes through the renderer       |
| math    | Attribute-free; error text goes through `ctx.sanitize`                         |
| mermaid | Attribute-free; SVG is mermaid's own output                                    |
| others  | Class names only, all literal                                                  |

Duplication between `CodePlugin`'s private escapers and `lib/escape-html.ts` was left
alone — collapsing it is a separate, unrelated commit.

**Verified** with a scratch harness: 12 scheme cases pass including the mixed-case,
leading-whitespace and embedded-newline bypasses; `data:image/png` accepted for `src` and
rejected for `href`; `data:image/svg+xml` rejected; preview output confirmed for a
`javascript:` link (`href=""`), a `javascript:` image (`src=""`), and `&`/`<`/`"` in
`title`, `alt`, `aria-label` and `figcaption`. `tsc --noEmit` clean.

**Public API note:** `draftly/lib` gains `isSafeUrl`, `safeUrl` and `SafeUrlOptions`.
Additive only. Flagged in the changeset.

**Not done:** the plugin-authoring checklist entry (last acceptance box) is in
`artifacts/architecture/plugin-system.md` and `AGENTS.md`, both updated with this commit.

## Notes

- The scheme guard is pure and CodeMirror-free, so it belongs in `lib/` and is a good
  early test target for T-001.
- Ships separately from T-010 — that one is about the renderer's fallback path, this one
  is about plugin output. Related symptom, different mechanism, two commits.
