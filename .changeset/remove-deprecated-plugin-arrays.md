---
"draftly": major
---

Remove the deprecated `essentialPlugins` and `allPlugins` arrays.

Both were pre-constructed module-level arrays of plugin instances shared by every importer.
Because a plugin instance holds per-editor state (`_config`, `_context`, and `TablePlugin`'s
deferred-work locks), two editors on one page overwrote each other's configuration and
cancelled each other's table normalization. C-026 added factories and deprecated the arrays
for one cycle; that cycle is over.

Replace each with the factory that builds a fresh set, **once per editor**:

```diff
- import { essentialPlugins } from "draftly/plugins";
- draftly({ plugins: essentialPlugins })
+ import { createEssentialPlugins } from "draftly/plugins";
+ draftly({ plugins: createEssentialPlugins() })
```

```diff
- import { allPlugins } from "draftly/plugins/all";
- draftly({ plugins: allPlugins })
+ import { createAllPlugins } from "draftly/plugins/all";
+ draftly({ plugins: createAllPlugins() })
```
