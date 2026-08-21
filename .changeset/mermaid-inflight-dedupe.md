---
"draftly": patch
---

`MermaidPlugin` now shares one render between widgets showing the same diagram.

Two widgets with the same definition, attributes and theme — the editor and preview panes,
a diagram repeated in a document, a widget rebuilt while its first render is still running
— previously each started their own `mermaid.render()`. They now share the in-flight
promise.

This is de-duplication rather than caching: the entry is retracted as soon as the render
settles, so an edited diagram is never served a stale SVG and a failed render is retried by
the next caller.
