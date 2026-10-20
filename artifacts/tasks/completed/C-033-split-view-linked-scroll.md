# C-033 — Linked scrolling in the split view

**Status:** Complete
**Priority:** Medium
**Created:** 2026-10-21
**Blocked on:** —

## Problem

C-032 shipped the split view with the two columns scrolling independently, and recorded
the reason: `preview()` emits no mapping back to source lines, so a shared scroll position
could only be guessed from heading order. The developer asked for it anyway — "scrolling
one panel should scroll the same on the other."

The objection was aimed at the wrong solution. Guessing *from heading order* is bad if the
guess is "the documents are proportionally the same shape". Using headings as explicit
correspondence points is not a guess at all — it is a coarse mapping that is exact at every
heading, which is as good as `data-line` attributes anywhere a reader is actually looking.

## Approach

`lib/scroll-sync.ts` — pure, no React and no CodeMirror:

- `findHeadings(markdown)` — ATX headings, tracking fenced blocks so a `#` comment inside
  one is not a heading.
- `buildScrollMapping(from, to, fromMax, toMax)` — pairs the two anchor lists, drops pairs
  no scroll position could reach and pairs that would invert the mapping, and pins both
  ends with `(0,0)` and `(fromMax,toMax)`.
- `mapScrollOffset(offset, mapping)` — piecewise-linear interpolation.

`routes/playground/use-linked-scroll.ts` — the DOM half: measuring anchors, the re-entrancy
claim, and the correction passes. `PageSheet` now exposes its scroll container through an
optional `scrollRef`, which `EditorPane` and `PreviewPane` forward and the route owns.

**Why a text scan and not the syntax tree.** Reading the tree needs a runtime import of
`@codemirror/language` into `apps/web`. A second copy of a CodeMirror package resolving
beside the library's own breaks facet identity — the exact failure the repo keeps those
dependencies external and peer to avoid. Headings are simple enough to recognise without a
parser.

**Rejected: proportional scrolling.** Measured first rather than argued about: on the
walkthrough the editor is 16,138px and the preview 22,034px, a 36% difference. Proportional
would be visibly wrong almost everywhere.

## Acceptance

- [x] Scrolling either column moves the other.
- [x] Headings stay aligned — 22 of 23 sampled land within 1px.
- [x] No feedback loop; the pair settles and stays settled.
- [x] No visible jump when a gesture ends.
- [x] Wheel scrolling stays monotonic at 1600px and 390px.
- [x] Typing still reaches the preview; other modes unaffected.
- [x] `bun run lint` and `bun run typecheck` clean.

## Notes

**Three measurement bugs, each found only by measuring.** None would have been caught by
reading the code, and the first two were found only because the check asserted on alignment
rather than on "did the other column move".

1. **Anchors measured once per gesture were stale by the end of it.** CodeMirror estimates
   unrendered line heights and refines them on render, so the editor's total height creeps
   as you travel. A long wheel gesture ended up to ~500px out and then visibly snapped when
   the correction ran. Fixed by re-measuring whenever either column's `scrollHeight`
   changes — two property reads per scroll event. The end-of-gesture jump went to zero.
2. **One correction pass is not enough.** Correcting the follower is what causes it to
   render its new neighbourhood, which is what makes the *next* measurement of that
   neighbourhood accurate: it is a fixed-point iteration. Bounded at four passes.
3. **The passes needed to span the async plugins.** `MermaidPlugin` and `MathPlugin` render
   after the fact and move the heights again. A fixed 80ms gap finished before they did, so
   the delay now doubles each pass, reaching ~1.2s in total.

**Known limitation, reproducible.** Heading 34 of the walkthrough — "Block Math (Display
Mode)", sitting between a KaTeX block and a Mermaid diagram — lands about one section out
when jumped to directly. Its anchor pair is correct and present; the editor's height map is
simply still moving while the correction runs. Every other sampled heading is exact. The
complete fix is a `ResizeObserver` on both content elements that re-aligns whenever async
content changes height, which was rejected for now because it would move the page under the
reader after they have stopped scrolling — plausibly worse than the miss it fixes.

**A false pass, again, and the same cause as C-032.** The first alignment probe matched
editor lines by text *prefix* and reported drift of 210px, 562px and 1160px at various
headings. Those were body lines that happened to start the same way. Exact matching, nearest
to the viewport top, showed the real figure was ≤1px — the implementation was already right
and the test was wrong. Two sessions running, the measuring instrument has been the thing
that was broken.

**Open question raised: should this be in the library?** `AGENTS.md` says a helper other
consumers would want belongs in `packages/draftly/src/lib/`, and scroll-syncing a Draftly
editor against a Draftly preview is squarely that. It is in `apps/web` for now because
moving it is a public API addition. Logged as open question 19.
