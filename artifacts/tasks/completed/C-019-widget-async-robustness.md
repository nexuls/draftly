# C-019 — Guard widget async work and repeated error nodes

**Status:** Complete
**Priority:** Medium
**Created:** 2026-08-18
**Completed:** 2026-08-18

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

- [x] No DOM writes into detached widget elements
- [x] Clipboard failure shows a visible error state and produces no unhandled rejection
- [x] Copy button works correctly when clicked repeatedly in quick succession
- [x] A broken image shows exactly one error message
- [x] Rapid editing around a mermaid block leaves no orphaned work

**All five are structural rather than observed** — none was exercised in a browser, since
none was available. Each corresponds to a specific guard that is now present and was not
before; that is weaker evidence than watching it, and the copy button in particular
deserves a manual click-twice-quickly check.

## Outcome

Landed as `fix(draftly): Guard widget async work and error paths`.

All six proposal items shipped.

### Mermaid (items 1, 2, 6)

`MermaidBlockWidget` implements `destroy()` and sets a `disposed` flag. The resolution
handler checks **both** `disposed` and `div.isConnected` — the first catches a widget
CodeMirror told us about, the second catches an element that left the document without
`destroy()` being reached. Cheap enough that having both is not worth optimising away.

`className +=` on the error path became `classList.add`, and the error text is now escaped
— it was interpolated straight into `innerHTML`, and mermaid error messages quote the
user's own diagram source back.

The id counter wraps at 1,000,000 rather than growing unbounded. Item 6 offered
`crypto.randomUUID()` as an alternative; a wrapping counter is cheaper, keeps ids readable
while debugging, and the window is far larger than the number of renders that can be in
flight.

### Copy button (items 3, 4)

Extracted to `copyToClipboard()`, which is the real fix — the old inline handler had
nowhere to put the failure path.

- `.catch()` shows a `copy-failed` state with a cross icon and a `title` of "Copy failed",
  themed red next to the existing green `copied`. Silently doing nothing on plain HTTP was
  a real UX bug in exactly the environment the playground runs in.
- The reset timer is held on the widget, cleared in `destroy()`, and cleared before being
  restarted — so a rapid second click restarts the window instead of having the first
  click's timer reset the button mid-state.
- Every DOM write is behind `copyBtn.isConnected`.

### Images (item 5)

`onerror` checks for an existing `.cm-draftly-image-error` before appending. Chose the
DOM check over an instance flag deliberately: the widget can be reused across renders now
that `eq()` compares content (C-017), so a flag would have to be reset somewhere and the
DOM is the actual source of truth.

### Note on the premise

The task assumed "with T-012 unfixed, most of these resolve into nodes CodeMirror has
already discarded". C-017 landed first, so that is no longer the common case — these
guards now cover genuine teardown rather than routine churn. The guards are still correct
and still needed; the volume they catch is much lower than the task anticipated.

## Notes

- Blocked on T-016 only for the `destroy()` hook. The clipboard `.catch()` and the image
  idempotence fix are independent and could ship immediately as small commits if T-016
  stalls.
- Test the clipboard path over plain HTTP — that is where it actually fails, and it will
  look fine on `localhost`, which browsers treat as a secure context.
