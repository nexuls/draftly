---
"draftly": minor
---

Add `createEssentialPlugins()` and `createAllPlugins()`; deprecate the `essentialPlugins`
and `allPlugins` arrays.

`essentialPlugins` and `allPlugins` were pre-constructed module-level arrays holding the
same instances, so every consumer of the library shared one set of plugin objects. Those
objects carry per-editor state — `_context` on the base class, and `TablePlugin`'s
`draftlyConfig` plus its three deferred-work re-entrancy locks. With two editors on one
page (a split view, a modal, a docs site with several examples) that state cross-talks:

- the second `draftly()` call's `onRegister` overwrites the first's context, so editor A
  renders with editor B's configuration;
- `scheduleNormalization` compares against a single `pendingNormalizationView` field, so
  B's scheduled work overwrites A's and A's queued microtask silently returns — table
  normalization is cancelled in editor A with no error.

The factories build a fresh set per call, which fixes both. Use one set per editor:

```diff
- import { allPlugins } from "draftly/plugins";
- draftly({ plugins: allPlugins })
+ import { createAllPlugins } from "draftly/plugins";
+ draftly({ plugins: createAllPlugins() })
```

**Not breaking.** `essentialPlugins` and `allPlugins` are still exported and still behave
exactly as before, including the shared-instance behaviour — upgrading the import is what
fixes the cross-talk, not merely recompiling. They are marked `@deprecated` and will be
removed in a future major.

Single-editor usage is unaffected either way.
