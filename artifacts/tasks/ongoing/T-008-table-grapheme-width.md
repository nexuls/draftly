# T-008 — Grapheme-aware table column widths

**Status:** Proposed
**Priority:** Low
**Created:** 2026-08-18
**Blocked on:** —

## Problem

`table-plugin.ts`'s `renderWidth()` computes the display width used to pad cells so the
raw markdown stays visually aligned. It measures by code unit, not by rendered width, so
it is wrong for:

- **CJK characters** — full-width glyphs occupy two columns in a monospace font but count
  as one.
- **Emoji** — often multiple code units for one glyph, and frequently double-width.
- **Combining marks** — accents count as separate units but render as zero width.
- **ZWJ sequences** — a family emoji can be many code points and one glyph.

Result: a table containing non-ASCII content has misaligned pipes in the raw markdown.

**Scope note:** this is cosmetic. The decorated editor view renders correct table layout
regardless, because alignment there comes from CSS on the `BlockWrapper`, not from
padding. It matters for the raw source — which is what the user sees with the cursor in
the table, what lands in git, and what any other markdown tool reads. Real, but not
urgent, which is why this is Low.

## Proposed approach

1. **Segment by grapheme cluster** using `Intl.Segmenter` with `granularity: "grapheme"`
   — available in all target browsers (Chrome 87+, Firefox 125, Safari 14.1) and Node 16+.
   Note Firefox support is more recent than the README's stated Firefox 78 floor; confirm
   the support matrix before relying on it, and feature-detect with a code-unit fallback.
2. **Classify width per cluster** against the East Asian Width property — full-width and
   wide are 2, combining and zero-width are 0, everything else is 1. A minimal inline
   range table avoids taking a dependency; alternatives like `string-width` pull in
   transitive packages for what is a small function.
3. **Keep it pure and isolated.** `renderWidth()` has no CodeMirror dependency and should
   keep none, so it stays unit-testable — this is a natural first test target for T-001.
4. **Cache** per string if profiling shows cost; padding runs on the deferred repair path,
   not per keystroke, so it likely does not matter.

Explicitly out of scope: making the _decorated_ view width-aware. It already uses CSS
layout and is correct.

## Affected areas

- `plugins/table-plugin.ts` — `renderWidth()`, and `padCell`/`delimiterCell` which consume it
  (or `plugins/table/text-utils.ts` if T-005 lands first)
- `artifacts/architecture/plugin-table.md` — remove the width caveat once fixed
- `README.md` browser support table — if `Intl.Segmenter` raises the floor

## Acceptance

- [ ] A table mixing ASCII, CJK, and emoji pads to visually aligned pipes in monospace
- [ ] Combining marks and ZWJ sequences counted as one cluster of correct width
- [ ] Behaviour unchanged for pure-ASCII tables (no diff churn in existing documents)
- [ ] Graceful fallback where `Intl.Segmenter` is unavailable
- [ ] Unit tests covering each character class

## Notes

- Best done after T-001 so the fix arrives with regression coverage, and after T-005 if
  that is approved, so it lands in `text-utils.ts` rather than being moved afterwards.
