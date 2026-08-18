# T-024 — Dead configuration surfaces in editor and preview

**Status:** Proposed
**Priority:** Low
**Created:** 2026-08-18
**Blocked on:** Developer decision (memory Q8)

## Problem

Three pieces of wiring that are constructed and populated but never read. Each reads as a
contract to anyone extending the code, and none is honoured.

### `draftlyThemeFacet`

Defined at `editor/view-plugin.ts:29` with a combine function, and populated at `:185`:

```ts
draftlyThemeFacet.of(theme),
```

Nothing reads it. `grep -rn "draftlyThemeFacet" packages/draftly/src` returns only the
definition and the `.of()` call. The theme reaches plugins by a different route entirely —
`draftly.ts:133` calls `plugin.theme(configTheme)` at extension-construction time and bakes
the result into an `EditorView.theme(...)`.

That difference matters: because the theme is baked in rather than read from a facet, a
theme change requires reconfiguring the whole extension set rather than updating a facet
value. The facet is the shape that would make theme switching cheap, half-built and
abandoned.

### `PreviewRenderer.theme` and `PreviewRenderer.sanitizeHtml`

`preview/renderer.ts:18` and `:21`. Both assigned in the constructor (`:36`, `:39`) and
never read — the values reach the context by being passed separately to
`createPreviewContext` at `:45`. Biome flags both under `noUnusedPrivateClassMembers`.

This is memory open question 8, recorded as "dead state, or a wiring bug?". The audit
confirms **dead state**: the constructor parameters are forwarded correctly, so the fields
are redundant copies, not a broken connection. Preview behaviour is correct today.

### `DraftlyPlugin.onUnregister`

`editor/plugin.ts:157`. Declared, documented as "Called when plugin is unregistered", never
called from anywhere. Covered operationally by T-016, listed here because it is the same
category and should be resolved by the same decision.

`DraftlyPlugin.dependencies` (`plugin.ts:61`) is the fourth member of this family and
already has its own task — see T-006.

## Proposed approach

For each, the choice is *finish it* or *remove it*, and the answer differs:

1. **`draftlyThemeFacet` — finish it.** Reading the theme from a facet enables runtime
   theme switching without a full reconfigure, which is a genuine improvement over the
   current bake-in and directly benefits T-019. If that is out of scope, delete it rather
   than leaving a facet that implies a capability the library does not have.
2. **`PreviewRenderer` fields — remove them.** Confirmed redundant. Two-line deletion, and
   it clears two Biome warnings from the burn-down backlog (memory Q7).
3. **`onUnregister` — finish it** as part of T-016, or delete it.

Resolve all three in one commit, since the decision is the same shape each time and
splitting produces three trivial commits with no independent value.

## Affected areas

- `editor/view-plugin.ts` — the facet
- `editor/draftly.ts` — if the facet is wired up properly
- `preview/renderer.ts` — the two fields
- `editor/plugin.ts` — `onUnregister`
- `artifacts/architecture/editor-core.md`, `artifacts/architecture/preview-pipeline.md`
- `artifacts/memory.md` — close question 8

## Acceptance

- [ ] No facet is populated without being read
- [ ] `PreviewRenderer` has no unread private fields; the two Biome warnings clear
- [ ] `onUnregister` is either invoked or gone
- [ ] Memory question 8 is answered and closed
- [ ] Preview output unchanged

## Notes

- **Do not act unilaterally** — memory Q8 is explicitly logged as awaiting the developer,
  and per `AGENTS.md` rule 1 the doc/code gap is itself information. The audit narrows the
  question from "dead or broken?" to "dead — remove or keep?", which should make it a
  quick answer.
- The `draftlyThemeFacet` decision is the substantive one. Wiring it up is a real feature
  (runtime theme switching); deleting it is five minutes. Worth asking which the developer
  intended, since the half-built state suggests the former was planned.
