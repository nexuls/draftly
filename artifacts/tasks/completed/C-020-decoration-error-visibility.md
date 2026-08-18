# C-020 — Dev-mode diagnostics for swallowed decoration errors

**Status:** Complete
**Priority:** Medium
**Created:** 2026-08-18
**Completed:** 2026-08-18

## Problem

`editor/view-plugin.ts:55` wraps every plugin's decoration pass in a bare catch:

```ts
try {
  plugin.buildDecorations(ctx);
} catch {
  // Silently ignore errors from partial tree states (e.g., Lezer TreeBuffer
  // "Invalid child in posBefore"). These resolve on the next update cycle.
}
```

The rationale is sound: Lezer legitimately exposes partially-built trees mid-parse, node
access throws, and the condition clears on the next update. Letting those propagate would
break the editor for a transient, expected state.

The cost is that **every** plugin error is invisible. A typo, a null dereference, or a bad
range in a plugin produces exactly the same symptom as the benign case: the decoration
silently does not appear. There is no log, no counter, no signal. Debugging currently
means editing library source to add a `console.error` and remembering to remove it.

Given decorations rebuild on every cursor move, a naive unconditional log would also be
unusable — it would flood the console during normal typing.

## Proposed approach

Distinguish expected parse-transience from genuine bugs, and surface only the latter.

1. **Detect the known-benign shape.** The Lezer partial-tree errors have a recognisable
   message (`Invalid child in posBefore`, and siblings). Match those and keep swallowing.
2. **Report everything else** through a pluggable diagnostics hook rather than a hardcoded
   `console.error`, so consumers can route it. Options:
   - a `DraftlyConfig.onPluginError?: (plugin: string, error: unknown) => void` callback —
     explicit, testable, no environment sniffing;
   - defaulting to `console.error` when `process.env.NODE_ENV !== "production"`.
     _Recommendation: the callback, defaulting to a dev-only `console.error`._
3. **Deduplicate.** Key on `plugin.name` + error message and report each distinct error
   once per session, so a persistent bug does not flood the console across rebuilds.
4. **Surface it in the playground.** A devbar panel listing plugin errors would make the
   whole class of bug self-evident during development.

## Affected areas

- `editor/view-plugin.ts` — the catch block
- `editor/draftly.ts` — new config option, threaded via a facet
- `apps/web/app/playground/devbar.tsx` — optional error panel
- `artifacts/architecture/editor-core.md` — update the swallowed-error caveat
- `artifacts/memory.md` — update the durable fact once behaviour changes

## Acceptance

- [x] A deliberate error thrown from a plugin's `buildDecorations` is visible in dev
- [x] Transient Lezer partial-tree errors remain silent
- [x] No console flooding during sustained typing or cursor movement
- [x] Production builds stay silent unless a handler is supplied
- [x] Architecture doc and memory entry updated

## Outcome

Landed as `feat(draftly): Report genuine plugin decoration errors`.

### How benign is distinguished from genuine

**Not by matching error messages.** The task's note flagged the risk and it is real —
Lezer's message text is not a stable contract across versions.

The discriminator is `syntaxTreeAvailable(view.state, view.viewport.to)`: if the tree is
not finished for the rendered range, the parse is still in progress and a throw is
expected. If it *is* finished, whatever threw is a bug. That is the actual invariant the
original comment was reaching for, and it needs no knowledge of Lezer's internals.

### Reporting

- New `DraftlyConfig.onPluginError?: (plugin: string, error: unknown) => void`, threaded
  through `draftlyOnPluginErrorFacet`. Took the recommended option: an explicit callback,
  defaulting to a dev-only `console.error`.
- Deduplicated on `plugin.name` + message via `reportOnce()` in `lib/dev.ts`. Decorations
  rebuild on every cursor movement, so without this the first occurrence — the one with
  the useful stack — would be buried within a second of typing.
- Production with no handler does no work beyond the `isDevMode()` check.

### Not done

Proposal item 4, the playground devbar error panel, was marked optional and is skipped.
It belongs in `apps/web` and the library-side hook it needs now exists, so it can be added
independently whenever the playground wants it.

## Notes

- Verify the exact error messages Lezer throws before relying on message matching; if
  they are not stable across versions, prefer matching the error constructor or checking
  whether the tree is still parsing (`syntaxTreeAvailable`).
