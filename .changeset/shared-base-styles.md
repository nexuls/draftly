---
"draftly": minor
---

Derive the preview's base CSS from the editor's base theme instead of a separate hardcoded
rule, so the two surfaces cannot drift apart on typography, width or padding.

`draftlyBaseStyles` is a new export holding the surface-agnostic half of the base theme;
`generateCSS()` re-emits it against the configured `wrapperClass`. Editor-only rules that
address CodeMirror internals (`.cm-line`, `.cm-widgetBuffer`, `.cm-focused`) stay out of it,
so the preview no longer carries dead selectors.

Preview output now inherits the editor's `max-width: 48rem`, centring and font stack. Pass
`includeBase: false` to `generateCSS()` if your layout supplies its own.

The editor also stops drawing a browser focus ring around the document; it already has a
caret and selection styling of its own.
