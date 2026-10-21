# C-036 — Blank lines collapse in the static preview

**Status:** Complete
**Priority:** Medium
**Created:** 2026-10-21
**Blocked on:** —

## Problem

The editor draws a blank source line as a real `.cm-line`, one line-height tall. The
static preview dropped it: blank lines reached `renderChildren` as gap text and were
emitted as raw `\n` characters, which HTML collapses to a single space. A document with
three blank lines between two paragraphs showed three empty lines in the editor and the
plain paragraph padding in preview.

This is an editor/preview parity break of the kind the architecture exists to prevent, but
it belongs to no plugin: there is no node for a blank line, so no `renderToHTML` was ever
going to see one. Gap text is the renderer's own responsibility.

## Approach

`renderChildren`'s two gap-emission sites now call a new `PreviewRenderer.renderGap`.
It splits the gap on newlines and replaces each **wholly blank** line with
`<span class="draftly-blank-line" aria-hidden="true"></span>`; every other segment is
escaped exactly as before, newlines included, so a non-blank gap comes out
byte-identical.

"Wholly blank" is the load-bearing part. A gap runs from the end of one node to the start
of the next, so its first and last segments are normally *partial* lines — the tail and
head of the neighbouring nodes' own lines — and an empty partial segment is not a blank
line. But a block node's `to` can sit at the start of the following line (`Heading` does
exactly that), which puts a genuine blank line in segment 0. Two boundary checks against
`this.doc` separate the cases; without them the count is short by one after every heading.

The spacer's rule is emitted by `generateCSS()`'s base chunk rather than the shared base
theme, because it is preview-only — the editor needs no such element. Its height is
`calc(1em * var(--draftly-line-height))`, which required promoting the base theme's
twice-repeated `lineHeight: "1.6"` to a `--draftly-line-height` token.

Rejected:

- **The `lh` unit.** `height: 1lh` says exactly the right thing, but it only reached
  Chrome 133. An unsupported declaration is dropped, which puts the height silently back
  to zero — the original bug, in the one place nobody would look.
- **A `<div>` spacer.** A gap can in principle sit in an inline context, where a block
  element is invalid markup. A `<span>` set to `display: block` is valid in both.
- **A `cm-`prefixed class.** Preview-only classes stay clear of the names the editor uses
  for line layout — see the `cm-draftly-list-line-ul` leak in `memory.md`.
- **Dropping the paragraph padding and spacing preview entirely from spacers.** It would
  change `ParagraphPlugin` on both surfaces to fix a renderer bug, and the editor has that
  padding too — the preview was short exactly one line-height, nothing else.

## Affected areas

- `packages/draftly/src/preview/renderer.ts` — `BLANK_LINE_HTML`, `renderGap`.
- `packages/draftly/src/preview/css-generator.ts` — `generateBlankLineStyles`, folded into
  the cached base chunk.
- `packages/draftly/src/editor/theme.ts` — the `--draftly-line-height` token.
- `artifacts/architecture/preview-pipeline.md` — the gap-preservation section.

**Published output changes for every consumer.** Each paragraph break in preview grows by
one line-height. That is the parity being asked for, not a side effect, but it is visible.
No public API or type changed.

## Acceptance

- [x] `tsc --noEmit` clean in `packages/draftly`.
- [x] `biome check` adds no new diagnostics — the 5 findings in the touched files are all
      pre-existing (two `useTemplate`, the `renderToHTML!` assertion, and the two unused
      private fields of open question 8).
- [x] Source blank lines equal emitted spacers across 16 documents: paragraphs with 1 and
      3 blanks, leading-only, trailing-only, blanks-only, heading, loose list, quote, HR,
      table, inline gaps, a soft-wrapped paragraph. Two deliberate non-matches — blanks
      inside a fenced block emit none (`CodePlugin` slices the body itself and preserves
      them in the `<pre>`), and the empty document emits none.
- [x] Generated CSS carries the rule, honours a custom `wrapperClass`, and the token
      resolves in the dark layer.
- [ ] Verified by eye in the playground. Not done: `playwright` is not a dependency here
      (only the browser binaries are cached), so no browser was driven from this session.

## Notes

Two things to look at in a browser, neither of which the counts can settle:

1. Whether one blank line between paragraphs now reads as slightly roomy. Editor and
   preview agree arithmetically — `0.5em` + 1.6em + `0.5em` on both sides — but the
   editor's blank line and the preview's padding+spacer are not the same pixels.
2. Indented (non-fenced) code blocks. `CodeBlock` is in no plugin's `requiredNodes`, so it
   falls through to the escaped-text fallback and its internal blank lines now get
   spacers. That path renders as plain text today, so this is not a regression, but it is
   the one place the new behaviour reaches content that is semantically preformatted.
