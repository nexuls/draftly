---
"draftly": major
---

Plugin keybindings now carry their own documentation, so a host can render a shortcut
reference without hardcoding one.

`DraftlyPlugin.getKeymap()` returns `DescribedKeyBinding[]` — a `KeyBinding` plus a required
`name` and `description`, and an optional `context` for bindings that only apply somewhere
specific. New `collectShortcuts(plugins)` gathers them across a plugin set.

`TablePlugin`'s fifteen shortcuts are documented for the first time. They register through a
precedence-wrapped extension rather than `getKeymap()`, so they are surfaced via the new
`getShortcuts()` hook and labelled `"Inside a table"` — they rebind `Tab`, `Enter` and the
arrow keys, which means listing them unqualified would be misleading.

**Breaking:** `name` and `description` are required, so a plugin overriding `getKeymap()`
with plain `KeyBinding`s no longer typechecks. Add the two fields; nothing about runtime
behaviour changes.
