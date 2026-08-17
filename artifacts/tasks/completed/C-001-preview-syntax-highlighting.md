# C-001 — Preview syntax highlighting via CodeMirror themes

**Status:** Complete
**Priority:** High
**Completed:** commits `17cdf9b`, `dab22ab`, `2480a42`, `0e925b1`, `c6a306a`
**Reconstructed:** 2026-08-18 from git history — this predates the artifact system, so the
record below is a summary rather than a contemporaneous task file.

## Problem

Code blocks rendered by `preview()` had no syntax colouring, while the same code in the
editor was fully highlighted. Two separate causes:

1. The static renderer had no access to the `HighlightStyle` a consumer had configured for
   the editor, so there was nothing to derive `tok-*` CSS from.
2. Preview parsed with a raw `@lezer/markdown` parser while the editor parsed through
   `@codemirror/lang-markdown`. The two produced trees of different shapes, so even the
   node names the renderer dispatched on did not always match.

## Outcome

- Added `preview/syntax-theme.ts` with `generateSyntaxThemeCSS()` and
  `resolveSyntaxHighlighters()`. These recursively unwrap nested CodeMirror `Extension`
  arrays (depth-capped at `MAX_WALK_DEPTH = 8`), find objects shaped like a
  `HighlightStyle`, and pull the CSS rules out of their internal `StyleModule`.
- Added `syntaxTheme` to `PreviewConfig` and `GenerateCSSConfig`; threaded resolved
  highlighters onto `PreviewContext.syntaxHighlighters` so `CodePlugin.renderToHTML` can
  use them.
- Switched `PreviewRenderer` to build its parser through `@codemirror/lang-markdown` with
  the same option object `draftly()` uses (`dab22ab`), guaranteeing identical trees.
- Fixed highlighter instancing so multiple highlighters apply in registration order
  (`2480a42`) and code-block text highlights inherit correctly (`0e925b1`).
- Switched code preview from sanitizing to `escapeHtml` (`c6a306a`) — code content must be
  escaped, never sanitized, or the sanitizer strips legitimate code.

## Durable consequences

- **The parser configuration is now duplicated** between `editor/draftly.ts` and
  `preview/renderer.ts` and must be kept in sync by hand. Changing markdown parser options
  in one place without the other reintroduces the original class of bug.
- **`syntax-theme.ts` reaches into undocumented CodeMirror internals.** A
  `@codemirror/language` upgrade can silently drop preview colouring with no type error
  and no exception. Re-test preview code blocks after any CodeMirror bump.

Both recorded in [`../../memory.md`](../../memory.md) and
[`../../architecture/preview-pipeline.md`](../../architecture/preview-pipeline.md).
