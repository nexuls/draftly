---
"draftly": patch
---

Resolve preview plugin conflicts by `decorationPriority`, matching the editor.

The editor sorted plugins by `decorationPriority`; preview dispatched in whatever order the
consumer passed them in. So two plugins claiming the same node — exactly what a consumer
adding a plugin to override a built-in does — resolved differently on the two surfaces,
undercutting the architecture's editor/preview parity guarantee.

Preview now tries candidates in descending `decorationPriority` and takes the first
non-null result, so a higher number wins on both surfaces. No built-in plugins share a
`requiredNodes` entry, so built-in output is unchanged.

Two plugins claiming the same node at the same priority now warn in development.
