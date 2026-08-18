---
"draftly": major
---

Move the three plugins with heavy dependencies behind their own entry points.

`MermaidPlugin`, `MathPlugin` and `EmojiPlugin` are no longer exported from `draftly` or
`draftly/plugins`. `createAllPlugins()` and the deprecated `allPlugins` array have moved to
`draftly/plugins/all`.

This was not a cosmetic distinction. tsup concatenates everything reachable from an entry
point into a single chunk, and that chunk's top-level `import mermaid from "mermaid"` is
evaluated whenever *any* binding in it is used. So `import { HeadingPlugin } from
"draftly/plugins"` — one small plugin — pulled mermaid, KaTeX and node-emoji, and bundled
to 8.0 MB. It now bundles to 2.5 MB, with none of the three present. Tree-shaking could not
help: these are third-party packages a bundler cannot prove side-effect-free, and CJS
consumers had no tree-shaking at all.

| Entry point               | Plugin          | Dependency   | Approx. bundled cost |
| ------------------------- | --------------- | ------------ | -------------------- |
| `draftly/plugins/mermaid` | `MermaidPlugin` | `mermaid`    | 5.3 MB               |
| `draftly/plugins/math`    | `MathPlugin`    | `katex`      | 475 KB               |
| `draftly/plugins/emoji`   | `EmojiPlugin`   | `node-emoji` | 312 KB               |

## Migration

If you used `allPlugins` or `createAllPlugins()`, change the import path — nothing else:

```diff
- import { createAllPlugins } from "draftly/plugins";
+ import { createAllPlugins } from "draftly/plugins/all";
```

If you imported a heavy plugin by name, take it from its entry point:

```diff
- import { MathPlugin, HeadingPlugin } from "draftly/plugins";
+ import { HeadingPlugin } from "draftly/plugins";
+ import { MathPlugin } from "draftly/plugins/math";
```

If you used `createEssentialPlugins()` and relied on it including math, mermaid or emoji,
it no longer does — that is the point of the change. Add what you want:

```ts
import { createEssentialPlugins } from "draftly/plugins";
import { MathPlugin } from "draftly/plugins/math";

draftly({ plugins: [...createEssentialPlugins(), new MathPlugin()] });
```

Nothing about a plugin's behaviour changed; only where you import it from.
