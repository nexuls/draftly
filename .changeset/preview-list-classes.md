---
"draftly": major
---

Fix nested list indentation in the preview.

Rendered lists were emitted with the editor's *line* classes
(`cm-draftly-list-line-ul`), which carry `display: flex` and a
`padding-left: calc(1rem * (var(--depth, 0) + 1)) !important` computed from a custom
property the editor sets per line. In static HTML nothing sets `--depth`, so every list —
top level or five deep — got the same `1rem`, and the `!important` meant the preview's own
`padding-left` could not override it.

Preview lists now use their own classes (`cm-draftly-list`, plus `-ul`/`-ol`) and indent
from the nested element's own padding, which is what nesting means in HTML.

**Breaking:** rendered `<ul>`/`<ol>` elements no longer carry `cm-draftly-list-line-ul`,
`cm-draftly-list-line-ol` or `cm-draftly-preview`. Restyle against `cm-draftly-list` if you
were targeting the old names.
