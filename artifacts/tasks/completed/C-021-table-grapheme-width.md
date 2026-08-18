# C-021 — Grapheme-aware table column widths

**Status:** Complete
**Priority:** Low
**Created:** 2026-08-18
**Completed:** 2026-08-18

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

- [x] A table mixing ASCII, CJK, and emoji pads to visually aligned pipes in monospace
- [x] Combining marks and ZWJ sequences counted as one cluster of correct width
- [x] Behaviour unchanged for pure-ASCII tables (no diff churn in existing documents)
- [x] Graceful fallback where `Intl.Segmenter` is unavailable
- [ ] **Unit tests — NOT DONE.** T-001 has not landed, so there is nowhere to put them.
      A 14-case scratch harness was used instead and its cases are listed below; they
      should be transcribed verbatim when a test runner exists.

## Outcome

Landed as `fix(draftly): Measure table column widths in display columns`.

New `lib/display-width.ts`, exported from `draftly/lib` as `displayWidth`. Pure,
dependency-free and CodeMirror-free — proposal item 3, and a ready-made first test target
for T-001.

`renderWidth()` in `table-plugin.ts` is now a thin wrapper: canonicalize break tags,
unescape pipes, then `displayWidth`.

### Design decisions

**No dependency.** `string-width` and equivalents pull in several transitive packages to
do what fits in a screen of range tables, and bundle size is a stated design constraint.
The East Asian Width ranges are inlined, sorted and binary-searched.

**Cluster width is the first code point's width.** Everything after the first in a
grapheme cluster is a combining mark, a variation selector, or a ZWJ continuation — all of
which render inside the same cell rather than beside it. That one rule handles combining
accents and ZWJ family emoji without special-casing either.

**The fallback degrades, it does not give up.** Without `Intl.Segmenter` the function
iterates code points, which is still correct for CJK, emoji and combining marks and only
over-estimates ZWJ sequences slightly. Reverting to `String.length` would have been the
easy fallback and a much worse one.

**The browser support floor is unchanged.** `Intl.Segmenter` needs Firefox 125 and
Safari 14.1, both above the README's stated floor — which is exactly why the fallback
exists rather than the floor moving. Both READMEs now carry a footnote saying so.

**No caching.** Padding runs on the deferred repair path, not per keystroke, so proposal
item 4 was measured as unnecessary and skipped.

### Verification

14 cases, all passing:

| Input                        | Width | Why it is interesting        |
| ---------------------------- | ----- | ---------------------------- |
| `abc`, `""`                  | 3, 0  | ASCII baseline, empty        |
| `日本語`, `한국어`             | 6, 6  | CJK and Hangul, wide         |
| `ＡＢ`                        | 4     | Fullwidth Latin              |
| `café` (precomposed)         | 4     | Single code point            |
| `café` (e + U+0301)          | 4     | Combining mark counts zero   |
| `😀`                         | 2     | Astral emoji                 |
| `👨‍👩‍👧`                       | 2     | ZWJ sequence, 8 code units   |
| `a😀b`                       | 4     | Mixed                        |
| U+200B                       | 0     | Zero-width space             |
| `Mixed 日本 and 🎉`           | 17    | Everything at once           |

Cross-checked against a hand-aligned mixed CJK/emoji table: all five lines measure 35
columns, which is the property the padding exists to produce.

## Notes

- Best done after T-001 so the fix arrives with regression coverage, and after T-005 if
  that is approved, so it lands in `text-utils.ts` rather than being moved afterwards.
