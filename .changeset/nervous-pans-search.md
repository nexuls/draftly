---
"draftly": minor
---

Scope decoration building to the viewport.

No plugin bounded its syntax-tree walk, so every editor update cost O(document) — and
because decorations rebuild on selection changes too, **moving the cursor one character
cost the same as editing**, across all 14 plugins.

`DecorationContext` gains `visibleRanges` and `iterateVisible()`. Plugins call
`ctx.iterateVisible({ enter })` instead of `syntaxTree(view.state).iterate({ enter })`;
the bounds come from the core, so a new plugin cannot repeat the mistake by omission.

On a 5,000-line document, building decorations for all plugins goes from 39.2 ms to
0.40 ms.

**For plugin authors:** this is the new required idiom. `ctx.iterateVisible` yields nodes
that *overlap* the viewport, so constructs straddling the edge are still decorated in full,
and a node spanning a gap between two visible ranges is entered only once.
