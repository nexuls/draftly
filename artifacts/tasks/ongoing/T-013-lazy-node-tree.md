# T-013 — Stop building the debug node tree on every update

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** —

## Problem

`editor/view-plugin.ts:124-152`'s `buildNodes` walks the entire syntax tree and allocates
a `DraftlyNode` object per node — with a `children` array and an `isSelected` flag that
costs a `selectionOverlapsRange` scan each — then hands the whole tree to `onNodesChange`.

It runs on every document change **and every selection change** (`view-plugin.ts:117`),
and it runs whenever the callback is merely *provided*. There is no way to have the
callback available but not pay for it.

The playground shows the cost precisely. It always passes the callback, then throws the
result away unless a panel is open (`apps/web/app/playground/page.tsx:317`):

```ts
onNodesChange: (nodes) => {
  if (showNodes) setNodes(nodes);
},
```

So a full-document tree is allocated on every keystroke and every cursor move, to be
discarded. The type's own JSDoc calls it "useful for debugging and development"
(`editor/draftly.ts:16`) — a debugging aid should not be on the hot path unconditionally.

This is the second full-document walk per update, on top of the 14 in T-011.

## Proposed approach

1. **Make it lazy.** Change the callback signature to hand over a getter rather than a
   built tree:
   ```ts
   onNodesChange?: (getNodes: () => DraftlyNode[]) => void
   ```
   Consumers that want the tree call it; consumers gating on a flag pay nothing. This is a
   public API change — see the open question below.
2. **Scope `isSelected` correctly.** If the tree is built lazily on demand it can still be
   selection-accurate, since it is built at call time from current state.
3. **Consider dropping the selection trigger.** If the tree is only consumed for debug
   display, rebuilding on cursor movement is not obviously required. If `isSelected` is
   the reason, the lazy getter already solves it.
4. **Fix the playground either way** — move the `showNodes` gate so the work is not
   requested when the panel is closed, rather than requested and discarded.

Alternative considered and rejected: keeping the eager build but skipping it when no
callback is registered. That helps consumers who omit the option and does nothing for the
playground's actual pattern, which is the realistic one — a consumer who wants the tree
*sometimes*.

## Affected areas

- `editor/view-plugin.ts` — `buildNodes`, `update`, constructor
- `editor/draftly.ts` — `DraftlyConfig.onNodesChange` signature, `DraftlyNode` docs
- `apps/web/app/playground/page.tsx` — the gate
- `README.md` — if `onNodesChange` is documented
- `artifacts/architecture/editor-core.md`

## Acceptance

- [ ] No tree is built when the consumer does not ask for one
- [ ] Playground node panel still shows a correct, live-updating tree when open
- [ ] `isSelected` is accurate at the moment the getter is called
- [ ] Closing the node panel measurably reduces per-keystroke work

## Notes

- **Open question for the developer:** `onNodesChange` is public API, so changing its
  signature is breaking. Options are (a) change it and ship a major, (b) add
  `onNodesRequest` alongside and deprecate, (c) keep the signature and accept the cost.
  Recommend (a) if a major is already planned, else (b). Raise before implementing.
- Cheap interim mitigation with no API change: skip the build when
  `!update.docChanged && !update.selectionSet`. Does not fix the discard-the-result case
  but is a one-line improvement if the API decision stalls.
