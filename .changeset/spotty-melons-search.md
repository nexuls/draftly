---
"draftly": patch
---

Remove redundant work from the preview renderer.

Each node's children are now rendered **once**. They used to be re-rendered per candidate
plugin and again for the default renderer, and since `renderNode` recurses, the
duplication compounded with depth.

The markdown parser is now cached across `preview()` calls rather than rebuilt per call —
constructing it pulls in the whole `@codemirror/language-data` registry, which in a
debounced live-preview setup happened on every keystroke.

`escapeHtml` is a single pass instead of five chained `.replace` calls.

Output is byte-identical: ~19% faster on the playground walkthrough document, ~14% on a
table-heavy one.
