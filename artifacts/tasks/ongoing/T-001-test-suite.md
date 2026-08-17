# T-001 — Establish a test suite

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
**Blocked on:** Developer decision on the runner (`bun test` vs Vitest) — memory Q5

## Problem

There is no test infrastructure anywhere in the repo: no runner, no test files, no
`test` task in `turbo.json`. Every change is verified by type-checking, linting, and
manual exercise in the playground.

This is the largest tooling gap in the project. It matters most for the pure logic layers,
which are numerous and entirely deterministic:

- `editor/utils.ts` — `deepMerge`, `flattenThemeStyles`, `fixSelector`, `createTheme`
  layer resolution. Pure in, pure out.
- `table-plugin.ts` text utilities — `isEscaped`, `getPipePositions`, `splitTableLine`,
  `parseAlignment`, `parseDelimiterAlignments`, `canonicalizeBreakTags`,
  `escapeUnescapedPipes`, `normalizeCellContent`, `renderWidth`, `padCell`,
  `parseTableMarkdown`, `formatTableMarkdown`. No CodeMirror dependency by design.
- `preview/default-renderers.ts` — `escapeHtml`.
- `preview/renderer.ts` — end-to-end markdown → HTML snapshots per plugin.

The table utilities are the strongest argument: they encode a dozen edge cases (escaped
pipes, `<br />` canonicalisation, delimiter patterns) that currently have no regression
protection at all, in the file that changes most often.

## Proposed approach

Stage it, smallest useful step first.

1. **Pick a runner.** `bun test` is zero-config and already available given Bun is the
   package manager. Vitest is heavier but has better watch/UI ergonomics and works with
   the existing TS setup. _Recommendation: `bun test`_ — it adds no dependency and the
   pure-function tests need nothing fancy.
2. **Add a `test` task** to `turbo.json` (uncached inputs on `src/**`) and a `test`
   script to `packages/draftly/package.json`.
3. **Cover the pure layers first** — `editor/utils.ts` and the table text utilities. High
   value, zero infrastructure needed.
4. **Add preview snapshot tests** — a small markdown corpus rendered through `preview()`
   with `allPlugins`, asserted against committed HTML. Catches cross-surface regressions
   cheaply.
5. **Leave editor decoration tests out of scope** for now — they need a DOM and a real
   `EditorView`, which is a much larger commitment. Revisit once 1–4 are in place.

## Affected areas

- `turbo.json` — new `test` task
- `packages/draftly/package.json` — `test` script, possibly a dev dependency
- New `packages/draftly/src/**/*.test.ts` (co-located) or `packages/draftly/test/`
- `artifacts/architecture/build-and-tooling.md` — replace the "no test suite" section
- `CONTRIBUTING.md` — document how to run tests

## Acceptance

- [ ] `bun run test` passes from the repo root and runs via Turborepo
- [ ] `editor/utils.ts` theme flattening and merging covered, including comma-separated
      selectors and `&` handling
- [ ] Table text utilities covered, including escaped pipes and `<br />` round-tripping
- [ ] At least one end-to-end `preview()` snapshot per built-in plugin
- [ ] `build-and-tooling.md` and `CONTRIBUTING.md` updated in the same series of commits

## Notes

- Commit in stages: runner setup, then utils tests, then table tests, then snapshots.
  Four correlated commits, not one.
