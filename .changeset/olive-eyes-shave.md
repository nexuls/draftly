---
"draftly": minor
---

Make rendered widgets reachable and announceable.

**Task lists can now be toggled without a mouse.** `Mod-Enter` toggles every task on the
selected lines. The rendered checkbox was `aria-hidden` with `tabIndex = -1`, so an
interactive control that mutates the document was invisible to assistive technology and
unreachable by keyboard — a keyboard user could only edit the raw `[ ]` text, which
`aria-hidden` prevented them from knowing was there. It is now announced as
"Task complete" / "Task incomplete", and the keybinding is the interface.

**Link URLs are discoverable without hovering.** Both link widgets carry the URL and the
otherwise-invisible "Ctrl+Click to open" affordance in a native `title`, which is announced
by screen readers and surfaces on long-press.

**Mermaid diagrams get a text alternative** derived from the diagram source; images fall
back to their alt text for the figure's accessible name; math and mermaid error states are
announced as alerts.

KaTeX already emits MathML beside its visual output, so formulas were readable — no
`aria-label` was added there, which would have replaced the MathML with a flat string.
