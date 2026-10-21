# C-038 — Fenced code blocks sit flush against their neighbours in the editor

**Status:** Complete
**Priority:** Medium
**Created:** 2026-10-21
**Blocked on:** —

## Problem

The preview gives a fenced code block `margin: 1rem 0` (`.cm-draftly-code-container`).
The editor gave it nothing: the block's visual box is painted by line decorations, and a
`.cm-line` cannot carry a margin — CodeMirror measures line heights directly, so a margin
would desync the height map. Padding on the first and last line was no substitute either;
those lines carry the block's background, border and corner radius, so padding grows the
coloured box instead of the gap around it.

Developer-reported, from a split-view screenshot: the code block touched the paragraph
above it in the editor while the preview showed a clear gap on both sides.

## Approach

`CodePlugin` now registers an `EditorView.blockWrappers` facet that wraps every
`FencedCode` node in a `div.cm-draftly-code-block-wrapper`, and the theme gives that
wrapper `padding: 1rem 0`.

A block wrapper is a real DOM element around the block's lines, and — this is the part
that makes it the right mechanism rather than a trick — CodeMirror *measures* it:
`measureVisibleLineHeights` tracks `spaceAbove` from the wrapper's bounds, so the
wrapper's padding reaches the height map instead of silently desyncing it. That makes a
wrapper the only sanctioned place to put block-level spacing in the editor.

`TablePlugin` already established the pattern; this is the second use.

Rejected:

- **Padding on `-line-start` / `-line-end`.** Grows the coloured box, not the gap. Keeping
  the background and border off the padded strip means repainting the whole box from a
  `::before`, which also costs the `overflow: hidden` corner clipping the header widget
  depends on.
- **A block widget spacer.** CodeMirror refuses block widgets from a view plugin's
  decorations, and Draftly's decorations all come from one view plugin.

## Affected areas

- `packages/draftly/src/plugins/code-plugin.ts` — `getExtensions()` plus a
  `computeBlockWrappers()`.
- `packages/draftly/src/plugins/code-plugin.theme.ts` — one rule.

Editor-only. Preview output, API and types are unchanged; the new rule also reaches
`generateCSS()`, where it matches nothing because preview emits no wrapper.

## Acceptance

- [x] `tsc --noEmit` clean in `packages/draftly`.
- [x] `biome check` clean.
- [x] Verified in the playground over Chrome: the wrapper exists once per fenced block,
      computed padding `18.4px 0`, and the measured gap above and below the block is 18px
      in the editor against 18px in the preview — parity, in split view, on the
      walkthrough document.
- [x] Scrolled the editor end to end afterwards; `scrollTop` settles where it is set and
      the height estimate converges, so the wrapper padding is not fighting the height map.
- [ ] Light theme not re-checked by eye. The rule introduces no colour.

## Notes

**`computeBlockWrappers` walks the whole document**, like `TablePlugin`'s. It feeds a
facet rather than the decoration set, and the facet functions run after the viewport is
computed; a wrapper that appeared and vanished with the viewport would make the block jump
as it scrolled. This is the second deliberate exception to the `ctx.iterateVisible` rule
from C-016, and for the same reason.

**A partially scrolled block puts CodeMirror's `cm-gap` inside the wrapper.** When only
the top of a block is rendered, the gap element standing in for everything below it starts
inside the wrapper's range and is nested into it, so the wrapper's bottom padding lands
after the gap rather than at the block's end. It is invisible (the wrapper paints nothing)
and self-corrects as the rest of the block renders. `TablePlugin`'s wrapper has the same
behaviour.
