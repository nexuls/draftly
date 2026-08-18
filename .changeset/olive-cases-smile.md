---
"draftly": patch
---

Stop widgets from being rebuilt on every keystroke.

Six widgets — image, both link widgets, inline math, block math and mermaid — compared
document positions in `eq()`. `eq()` answers "can CodeMirror keep the DOM it already
built?", and positions shift on any edit earlier in the document, so the answer was
permanently no. Typing one character at the top of a file re-rendered every KaTeX formula
and re-ran an async `mermaid.render()` for every diagram below it, and destroyed and
re-created every `<img>`.

They now compare content only. The click handlers resolve the construct's range from the
live DOM at event time via the new `resolveWidgetRange()` in `draftly/lib` — which is also
more correct than the old snapshot, since a snapshot taken at decoration-build time went
stale the moment anything above it changed.

`MermaidBlockWidget` also stops comparing its attributes with `JSON.stringify`, which was
key-order dependent and allocated two strings per comparison.
