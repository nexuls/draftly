---
"draftly": minor
---

Add a teardown lifecycle.

The library had no teardown path at all: no `destroy()` on the view plugin, no
`onViewDestroy`, and `onUnregister` declared but never called. Since plugin instances are
module-level singletons, anything a plugin held outlived every view — most concretely
`TablePlugin`'s three pending-view fields, which retained a destroyed `EditorView` (and
therefore its DOM, state and document) for the lifetime of the page if a repair microtask
was in flight when the view went away. Hosts that rebuild their extension array on a
config change destroy views routinely.

`DraftlyPlugin` gains `onViewDestroy(view)`, symmetric with `onViewReady`, called from the
view plugin's `destroy()`. **Plugins holding view-scoped state must release it there.**

`TablePlugin` releases its pending views, and its queued microtasks now bail rather than
dispatching into a destroyed editor.

`onUnregister` is marked `@deprecated`: it cannot be wired up correctly while plugin
instances are shared singletons. Use `onViewDestroy`.
