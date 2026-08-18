# T-018 — Guard widget async work and repeated error nodes

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** T-016 (needs a widget teardown path)

## Problem

Several widgets start work that outlives the DOM they write into, with no cancellation and
in one case no error handling.

### Mermaid writes into possibly-detached nodes

`mermaid-plugin.ts:113-121`:

```ts
renderMermaid(this.definition, this.attributes, this.defaultTheme).then(({ svg, error }) => {
  if (error) { div.className += " cm-draftly-mermaid-error"; div.innerHTML = ...; }
  else { div.innerHTML = svg; }
});
```

No check that the widget still exists. With T-012 unfixed, most of these resolve into
nodes CodeMirror has already discarded — pure waste. Note also `div.className +=` on the
error path: if the same element were ever reused the class would accumulate.

### Copy button: uncancelled timer and unhandled rejection

`code-plugin.ts:175-181`:

```ts
navigator.clipboard.writeText(this.codeContent).then(() => {
  copyBtn.classList.add("copied");
  copyBtn.innerHTML = CHECK_ICON;
  setTimeout(() => { copyBtn.classList.remove("copied"); copyBtn.innerHTML = COPY_ICON; }, COPY_RESET_DELAY);
});
```

- No `.catch()`. `navigator.clipboard.writeText` rejects when permission is denied, when
  the document is not focused, or over plain HTTP — producing an unhandled promise
  rejection and no user feedback at all. The button just does nothing.
- The 2-second timer is never cleared. If the widget is destroyed in between it fires
  against a detached node.

### Image error spans accumulate

`image-plugin.ts:104-111` appends a fresh `errorSpan` on every `onerror`. `onerror` can
fire more than once for the same element (re-decode, src reassignment), leaving duplicate
`[Image not found: …]` messages stacked in the figure.

### Mermaid id counter

`mermaid-plugin.ts:22` increments a module-level counter per render, unbounded. Harmless
alone, but it means mermaid's internal id space grows for the page's lifetime and makes it
hard to reason about what mermaid retains internally.

## Proposed approach

1. **Implement `destroy()` on `MermaidBlockWidget` and `CodeBlockHeaderWidget`** — the hook
   T-016 makes available. Set a `disposed` flag; check it before writing DOM, and clear
   pending timers.
2. **Guard async writes** with both the flag and `div.isConnected`. Cheap, and covers the
   case where teardown happened without `destroy()` being reached.
3. **Add `.catch()` to the clipboard call** with a visible failure state — the button
   should show that copying failed, not silently no-op. This is a real UX bug on HTTP and
   in unfocused iframes, which is exactly where a docs-site playground runs.
4. **Track the reset timer** on the widget instance and clear it in `destroy()`; also clear
   any previous timer on a repeat click so rapid clicking does not race.
5. **Make the image error path idempotent** — check for an existing error span, or set a
   flag, before appending.
6. **Use `crypto.randomUUID()` or a bounded counter for mermaid ids** if the unbounded
   growth turns out to matter after T-012 and T-015 cut the render count.

## Affected areas

- `plugins/mermaid-plugin.ts` — `MermaidBlockWidget`
- `plugins/code-plugin.ts` — `CodeBlockHeaderWidget`
- `plugins/image-plugin.ts` — `ImageWidget.onerror`
- `artifacts/architecture/plugin-system.md` — widget authoring guidance

## Acceptance

- [ ] No DOM writes into detached widget elements
- [ ] Clipboard failure shows a visible error state and produces no unhandled rejection
- [ ] Copy button works correctly when clicked repeatedly in quick succession
- [ ] A broken image shows exactly one error message
- [ ] Rapid editing around a mermaid block leaves no orphaned work

## Notes

- Blocked on T-016 only for the `destroy()` hook. The clipboard `.catch()` and the image
  idempotence fix are independent and could ship immediately as small commits if T-016
  stalls.
- Test the clipboard path over plain HTTP — that is where it actually fails, and it will
  look fine on `localhost`, which browsers treat as a secure context.
