---
"draftly": patch
---

Make `import { draftly } from "draftly"` tree-shakeable.

The barrel re-exports every plugin, and `math-plugin.ts` injected KaTeX's stylesheet at
module scope while `mermaid-plugin.ts` called `mermaid.initialize()` at module scope. Those
are genuine side effects, so no bundler could drop the modules — every consumer paid for
mermaid (roughly a megabyte) and KaTeX whether or not they wrote a diagram or a formula.

Both are now lazy: the stylesheet is injected on first render, and mermaid initializes
behind a guard on first render. With the side effects gone, `packages/draftly` declares
`"sideEffects": false` truthfully.

Verified by bundling the published artefact rather than by inspection:
`import { draftly }` now produces 6.2 KB with no reference to mermaid, katex or
node-emoji. Before, the same bundle could not be produced at all.

The unused `zod` dependency is dropped.

Module-scope DOM mutation was also an SSR hazard — the KaTeX injection touched `document`
during module evaluation.
