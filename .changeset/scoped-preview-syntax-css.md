---
"draftly": patch
---

Scope preview syntax-highlight CSS to the preview wrapper. `generateSyntaxThemeCSS()`
accepted a `wrapperClass` but ignored it, so the bare `.tok-*` rules CodeMirror emits were
written into the host page's global stylesheet and also restyled the editor. Rules are now
prefixed with the configured wrapper class, with `@media`/`@supports` bodies scoped
recursively and `@keyframes` left intact.
