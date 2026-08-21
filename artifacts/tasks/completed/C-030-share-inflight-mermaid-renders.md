# C-030 — Share in-flight Mermaid renders

**Status:** Complete
**Priority:** Low
**Created:** 2026-08-18
**Blocked on:** —

> **Rescoped.** This was "memoize KaTeX, Mermaid and emoji". Step 5 said to measure before
> writing the cache; the measurement is in Notes below and it killed two of the three
> cases. The emoji and math halves are **dropped as not worth the code**. What survives is
> the mermaid promise-sharing in step 3, which was never really a caching argument.

## Problem

Three deterministic, expensive functions are recomputed from scratch every time they are
reached, with no caching:

| Function                            | Site                     | Called from                  |
| ----------------------------------- | ------------------------ | ---------------------------- |
| `renderMath(latex, displayMode)`    | `math-plugin.ts:45`      | `toDOM`, synchronously       |
| `renderMermaid(definition, ...)`    | `mermaid-plugin.ts:23`   | `toDOM`, asynchronously      |
| `emoji.emojify(raw)`                | `emoji-plugin.ts:9`      | `buildDecorations`, per node |

All three are pure functions of their inputs. The emoji case is the worst-shaped: it runs
inside the decoration walk (`emoji-plugin.ts:80`), so it executes for every emoji
shortcode in the document on every keystroke and every cursor move — and `emojify` does a
regex scan and dictionary lookup each time.

The math and mermaid cases are currently amplified by T-012 (widgets rebuild constantly),
but they remain worth caching afterwards: the same formula re-enters the viewport on every
scroll, and `toDOM` runs again each time.

`mermaidCounter` (`mermaid-plugin.ts:22`) also increments unboundedly, one per render —
harmless in itself, but a decent proxy for how much redundant rendering is happening.

## Proposed approach

1. **Add a small LRU** in `lib/` — pure, dependency-free, ~40 lines, shared by all three
   call sites. Keyed on the full input tuple.
2. **Bound it.** A document with hundreds of distinct formulae should not pin them all
   forever. 100–200 entries is ample; the working set is what is on screen.
3. **Cache the promise, not the result, for mermaid.** Two widgets rendering the same
   definition concurrently should share one in-flight render rather than starting two.
   Evict on rejection so a transient failure is not cached permanently.
4. **Cache negative results for emoji.** `shortcodeToEmoji` returns `null` for unknown
   shortcodes (`emoji-plugin.ts:8-11`) and that lookup is just as expensive as a hit.
   Cache both outcomes.
5. **Measure before assuming.** Once T-011 and T-012 land, the remaining redundant calls
   may be few enough that this is not worth the code. Sequence it after them and confirm
   there is still something to win.

## Affected areas

- new `lib/lru.ts` — pure, testable
- `plugins/math-plugin.ts` — `renderMath`
- `plugins/mermaid-plugin.ts` — `renderMermaid`
- `plugins/emoji-plugin.ts` — `shortcodeToEmoji`
- `artifacts/architecture/plugins-catalog.md` — note the caching behaviour

## Acceptance

- [x] Measured improvement recorded in Notes, or the task is dropped with that finding —
      **measured; the emoji and math cases are dropped.**
- [x] Concurrent mermaid renders of the same definition share one in-flight promise
- [x] A failed mermaid render is retried rather than left cached as a permanent failure
- [x] Editing a diagram still updates it immediately (no stale hit)
- [ ] **Playground checklist — not run.** Needs a browser.

Dropped from the original list, with the numbers that killed them: a bounded LRU in
`lib/`, caching `emoji.emojify`, and caching `renderMath`.

## Notes

- Sequence after T-011 and T-012. Both remove large amounts of the redundant calling that
  makes this look valuable; re-measure before writing the cache.
- The LRU is pure and CodeMirror-free, so it belongs in `lib/` and is a natural early test
  target for T-001.
- Dropping this task with a recorded "measured, not worth it" is a perfectly good outcome
  and more useful than a speculative cache.
- **2026-08-18 — measured, and two thirds of the task died.** Node 24, this machine, warmed,
  against the installed `node-emoji` and `katex`:

  | Call                        | Cost        |
  | --------------------------- | ----------- |
  | `emoji.emojify(shortcode)`  | 0.00036 ms  |
  | `katex.renderToString(f)`   | 0.109 ms    |

  - **Emoji — dropped.** This was framed as the worst-shaped case because it runs inside
    the decoration walk on every keystroke. After C-016 that walk is viewport-scoped, so
    the multiplier is emoji *on screen*, not in the document. Even at an absurd 100 visible
    shortcodes it adds **0.036 ms** to a decoration build that C-016 measured at 0.40 ms —
    under 10% at a density no real document has. A cache here would cost more in code than
    it saves in time.
  - **Math — dropped.** `renderMath` is called from `toDOM`. After C-017 widgets are reused
    across edits, so it no longer runs per keystroke; it runs when a widget is genuinely
    new, i.e. on scroll re-entry. Five formulae re-entering the viewport is **0.54 ms**,
    once, well inside a frame. The original estimate was inflated precisely by the T-012
    bug that C-017 fixed.
  - **`mermaidCounter` is already bounded.** The task cites it growing unboundedly; it now
    wraps at `MERMAID_ID_WINDOW`. That observation is stale.
  - **Mermaid — survives, but not as a cache.** Not benchmarked: `mermaid.render` needs a
    DOM, and there is no browser here. The remaining argument is de-duplication, not
    memoization — two widgets with the same definition should share one in-flight render
    rather than starting two. That is worth doing on its own terms, and is why the task is
    rescoped rather than closed.
- **2026-08-18 — not implemented, deliberately.** The mermaid change is async cache logic
  whose failure modes (a stale diagram, a permanently-cached error) are exactly what cannot
  be checked without rendering one. Shipping it unverified would trade a measured
  non-problem for an unmeasured risk.
- **2026-08-21 — implemented on the developer's instruction.** The design answers that
  objection structurally rather than by testing: the map holds only **in-flight** promises
  and the entry is retracted in `.finally()`, so there is no state left behind for a stale
  diagram or a stuck error to live in. Both failure modes require a settled result to be
  retained, and none is. What remains untested is the happy path, which needs a browser.
- **Key shape.** `defaultTheme`, the parsed fence attributes and the definition, joined by
  NUL. Attribute order comes from the fence, so `theme="a" scale="2"` and
  `scale="2" theme="a"` key differently — a redundant render, never a wrong one.
- **The deletion is identity-guarded** (`if (inFlightRenders.get(key) === pending)`).
  Without it, a render that settled after a same-key successor had been registered would
  delete the successor's entry.
- **Known consequence: duplicate SVG element ids.** Sharing one render means sharing one
  SVG string, so two widgets on the same definition now insert identical internal ids
  (mermaid's marker and gradient defs) instead of ids distinguished by `mermaidCounter`.
  `url(#id)` resolves to the first match, and both copies are identical, so it renders
  correctly; removing the first leaves the second's defs as the new first match, so it
  self-heals. Invalid HTML, no visible effect. Flagged rather than worked around, because
  the alternative is not sharing the render at all.
