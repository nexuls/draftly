---
"draftly": minor
---

Give paragraphs the same spacing in the editor as in the preview. `ParagraphPlugin`
previously only had a `renderToHTML`, so its padding existed on one surface only.

The padding is split across the paragraph's first and last line rather than applied to
every line, since a paragraph's markdown source can span several lines and a per-line class
carrying both edges would open a gap between each of them.
