# T-016 — Add a teardown lifecycle for plugins and widgets

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
**Blocked on:** —

## Problem

```
$ grep -rn "destroy" packages/draftly/src
$
```

Nothing. The library has no teardown path at all:

- `draftlyViewPluginClass` (`editor/view-plugin.ts:78`) has no `destroy()`. CodeMirror
  calls it on every view plugin when the view is torn down; Draftly does not implement it.
- No `WidgetType` implements `destroy()`.
- `DraftlyPlugin` has `onViewReady` (`plugin.ts:167`) and `onViewUpdate` (`plugin.ts:177`)
  but no matching `onViewDestroy`. `onUnregister` (`plugin.ts:157`) exists and **nothing
  ever calls it** — `draftly.ts` calls `onRegister` at `:118` and there is no counterpart.

So when an `EditorView` is destroyed, plugins are never told, and anything they are
holding stays held. The concrete leak this enables is in `table-plugin.ts:741-743`:

```ts
private pendingNormalizationView: EditorView | null = null;
private pendingPaddingView: EditorView | null = null;
private pendingSelectionRepairView: EditorView | null = null;
```

If a view is destroyed while a microtask is pending (`table-plugin.ts:1127`, `:1189`,
`:1235`), the plugin retains a strong reference to the entire editor — view, DOM, state,
document — indefinitely. Because plugin instances are module-level singletons (T-017),
that reference lives for the lifetime of the page.

This is not hypothetical in the playground: `defaultExtensions` is rebuilt whenever any
devbar toggle, theme, or mode changes (`apps/web/app/playground/page.tsx:296-321`), so
views are created and destroyed routinely during normal use.

## Proposed approach

1. **Implement `destroy()` on the view plugin class.** It is the anchor everything else
   hangs off:
   ```ts
   destroy() {
     for (const plugin of this.plugins) plugin.onViewDestroy(this.view);
   }
   ```
   This requires holding the view on the instance, which the class currently does not do.
2. **Add `onViewDestroy(view: EditorView): void`** to `DraftlyPlugin` as a no-op default,
   symmetric with `onViewReady`. Document that plugins holding view-scoped state must
   release it here.
3. **Clear the table plugin's pending-view fields** in `onViewDestroy`, and have each
   queued microtask bail if its view has been destroyed. `EditorView` does not expose a
   public "destroyed" flag, so the guard should be the existing identity check plus an
   explicit null on teardown — read `artifacts/architecture/plugin-table.md` first, since
   those fields are re-entrancy locks and their semantics are load-bearing.
4. **Resolve `onUnregister`.** Either call it from a real unregister path or delete it.
   A lifecycle hook that is never invoked is worse than no hook — it reads as a contract.
   This overlaps the "dead surfaces" theme in T-006 and T-024.
5. **Add `destroy()` to widgets that need it** — the async and timer cases are detailed in
   T-018, which depends on this task landing first.

## Affected areas

- `editor/view-plugin.ts` — `destroy()`, hold the view
- `editor/plugin.ts` — `onViewDestroy`, and the fate of `onUnregister`
- `plugins/table-plugin.ts` — release the three pending-view fields
- `artifacts/architecture/editor-core.md` — lifecycle section
- `artifacts/architecture/plugin-system.md` — lifecycle hook table
- `artifacts/architecture/plugin-table.md` — the scheduling mechanism's teardown behaviour
- `AGENTS.md` — plugin authoring checklist
- `artifacts/memory.md` — durable fact

## Acceptance

- [ ] Destroying an `EditorView` invokes `onViewDestroy` on every registered plugin
- [ ] No plugin retains a reference to a destroyed view
- [ ] Creating and destroying 100 editors in the playground leaves no retained views in a
      heap snapshot
- [ ] Table normalization still works correctly on live views (no regression from the
      added guards)
- [ ] `onUnregister` is either wired up or gone

## Notes

- Verify with Chrome DevTools: take a heap snapshot, toggle a devbar option 20 times,
  snapshot again, and filter for detached `EditorView` / detached DOM nodes. That is the
  only evidence available without T-001.
- This is the enabling task for T-017 and T-018 — do it first.
