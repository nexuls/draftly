# C-028 — Remove the deprecated `essentialPlugins` / `allPlugins` arrays

**Status:** Complete
**Priority:** Medium
**Created:** 2026-08-21
**Blocked on:** —

## Problem

C-026 replaced the shared-singleton plugin arrays with `createEssentialPlugins()` /
`createAllPlugins()` factories, but kept the arrays exported and **behaviourally
unchanged** for one deprecation cycle — a consumer who merely recompiled kept the
cross-editor state-sharing bug. C-027 deliberately did not cut that cycle short. Leaving
them indefinitely means the broken shape stays reachable from the published API, and
`plugins/all.ts` has to keep importing `essentialPlugins` from the barrel just to build it.

## Approach

Delete both `const` declarations and their `export { … }` statements, then remove every
reference in prose. No behavioural change to the factories.

## Affected areas

- `packages/draftly/src/plugins/index.ts` — `essentialPlugins` removed
- `packages/draftly/src/plugins/all.ts` — `allPlugins` removed; no longer imports
  `essentialPlugins`
- `packages/draftly/src/editor/plugin.ts` — class JSDoc no longer cites the arrays
- `README.md`, `packages/draftly/README.md` — two rows dropped from the exports table
- `AGENTS.md` — trap rewritten
- `artifacts/architecture/plugin-system.md`, `plugins-catalog.md`, `artifacts/memory.md`

## Acceptance

- [x] Neither symbol is exported from any entry point
- [x] `bun run typecheck` clean
- [x] `bun run lint` clean
- [x] Major changeset added (`.changeset/remove-deprecated-plugin-arrays.md`)
- [x] Memory open question 9 closed

## Outcome

Shipped 2026-08-21. Open question 9 is fully answered: remove, as a major. The factories
are now the only way to build a plugin set.
