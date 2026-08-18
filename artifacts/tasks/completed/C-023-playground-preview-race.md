# C-023 — Playground: unguarded async preview and wrong word count

**Status:** Complete
**Priority:** Low
**Created:** 2026-08-18
**Completed:** 2026-08-18

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


## Outcome

Landed as `fix(web): Guard the preview effect and fix the word count`.

Playground-only; no library change, and no changeset.

### Preview effect

Standard cancellation flag, cleared in the cleanup function. Both `setOutputTime` and
`setOutput` sit inside the guard — the task called out the timing as a separate symptom,
but it has the same cause and the same fix: `start` belongs to one run and could be
attributed to another. Guarding both means the reported time always describes the output
actually on screen. The flag also covers the setState-after-unmount case.

### Word count

`content.split(" ").length` counted newline-separated words as one, counted consecutive
spaces as words, and returned 1 for an empty document — shown to the user as a document
statistic. Now trims, then splits on `/\s+/`, with an explicit zero for empty and
whitespace-only input.

Proposal item 4 folded in: `counts` split the document three times for three numbers and
now does the minimum. The Biome suppression stays — it is about the dependency array
deliberately keying on `contents[currentContent]?.content` rather than on `contents`
identity, which the rewrite does not change.

Verified against 9 cases: empty, whitespace-only, newline-only, single word, repeated
spaces, newline-separated, leading/trailing padding, and tabs.

### Not done

Proposal item 2, debouncing the preview itself, was a "consider" and is skipped. The
cancellation guard fixes the correctness problem outright; debouncing would only reduce
wasted work, at the cost of adding latency to plugin toggles, which are the interaction
where immediate feedback matters most in a playground.