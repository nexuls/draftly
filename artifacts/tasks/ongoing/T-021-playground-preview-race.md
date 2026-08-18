# T-021 — Playground: unguarded async preview and wrong word count

**Status:** Proposed
**Priority:** Low
**Created:** 2026-08-18
**Blocked on:** —

## Problem

Two `apps/web` bugs. Both are playground-only — no library change.

### Preview effect has no cancellation

`app/playground/page.tsx:319-347` runs an async IIFE inside `useEffect` with no cleanup
and no stale-result guard:

```ts
useEffect(() => {
  (async () => {
    const start = performance.now();
    const html = await preview(...);
    const css = generateCSS(...);
    setOutputTime(performance.now() - start);
    setOutput({ html, css });
  })();
}, [currentContent, contents, theme, mode, activePlugins, config.preview, cmTheme]);
```

The dependency array includes `contents` and `activePlugins`, so rapid edits or plugin
toggles start overlapping renders. Whichever finishes last wins, not whichever started
last — so the preview pane can display output for a superseded document. The reported
render time is also wrong when runs overlap, since `start` belongs to one run and the
elapsed calculation may be attributed to another.

Also: `setOutput` fires on an unmounted component if the user navigates mid-render.

### Word count is wrong

`app/playground/page.tsx:210`:

```ts
const words = content!.content.split(" ").length;
```

Splitting on a single space counts newline-separated words as one, counts consecutive
spaces as empty words, and returns 1 for an empty document. The footer shows this to the
user as a document statistic.

## Proposed approach

1. **Guard the effect** with the standard cancellation flag, and clear it in the cleanup
   function:
   ```ts
   let cancelled = false;
   (async () => { ...; if (!cancelled) setOutput({ html, css }); })();
   return () => { cancelled = true; };
   ```
   Move the `performance.now()` end-measurement inside the same guard so the reported time
   always belongs to the render being displayed.
2. **Consider debouncing the preview** rather than only the save. `contents` updates on the
   debounced save (`page.tsx:230`), so preview already lags typing by `DEBOUNCE_MS`, but
   plugin toggles fire immediately and each triggers a full re-render including
   `generateCSS()` for 14 plugins.
3. **Fix the word count** — `content.trim().split(/\s+/).filter(Boolean).length`, with an
   explicit zero for empty input.
4. **While in there:** the `counts` `useMemo` (`page.tsx:207-215`) splits the document three
   times to compute three numbers. One pass is enough, and it carries a Biome suppression
   for its dependency array that a single-pass rewrite may make unnecessary.

## Affected areas

- `apps/web/app/playground/page.tsx` — the preview effect, `counts`
- `apps/web/app/playground/footer.tsx` — if the display needs adjusting

## Acceptance

- [ ] Rapidly toggling plugins never leaves the preview showing superseded output
- [ ] Reported render time always corresponds to the displayed output
- [ ] No state updates after unmount
- [ ] Word count is correct for multi-line text, leading/trailing whitespace, repeated
      spaces, and an empty document

## Notes

- Playground-only, so it needs no changeset and cannot break consumers. Good candidate for
  a first commit in a session — small, self-contained, no architectural decisions.
- Per `AGENTS.md`, keep this in `apps/web`. None of it belongs in the library.
