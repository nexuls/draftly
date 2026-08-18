---
"draftly": patch
---

Measure table column widths in display columns, not code units.

`renderWidth()` padded cells by `String.length`, which misaligns the raw markdown for
anything non-ASCII: a CJK glyph is one code unit and two columns, an emoji is two and two,
a combining accent is one and zero, and a ZWJ family emoji is eight and two.

New `displayWidth` in `draftly/lib` measures monospace columns using `Intl.Segmenter` for
grapheme clustering and an inlined East Asian Width table — no new dependency. Pure ASCII
measures exactly as before, so existing documents see no padding churn.

Where `Intl.Segmenter` is unavailable, the fallback measures per code point: still correct
for CJK, emoji and combining marks, and only slightly over-estimating ZWJ sequences. The
browser support floor is unchanged.

This only affects the raw markdown. The rendered table view was always correct — it is laid
out with CSS, not padding.
