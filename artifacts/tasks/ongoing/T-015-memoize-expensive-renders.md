# T-015 — Memoize expensive pure renders (KaTeX, Mermaid, emoji)

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** —

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

- [ ] Repeated renders of identical input hit the cache
- [ ] Cache size stays bounded on a document with many distinct formulae
- [ ] Concurrent mermaid renders of the same definition share one in-flight promise
- [ ] A failed mermaid render is retried rather than cached as a permanent failure
- [ ] Editing a formula still updates it immediately (no stale cache hit)
- [ ] Measured improvement recorded in Notes, or the task is dropped with that finding

## Notes

- Sequence after T-011 and T-012. Both remove large amounts of the redundant calling that
  makes this look valuable; re-measure before writing the cache.
- The LRU is pure and CodeMirror-free, so it belongs in `lib/` and is a natural early test
  target for T-001.
- Dropping this task with a recorded "measured, not worth it" is a perfectly good outcome
  and more useful than a speculative cache.
