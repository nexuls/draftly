# Architecture Index

> Last verified: 2026-08-18 · commit `eae4434`
> Every architecture document in `artifacts/architecture/`, with enough context to pick
> the right one without opening all of them.

---

## Read this first

**[overview.md](./overview.md)** — _the problem, the solution, the system shape_

Why Draftly exists (markdown editors force a bad trade-off between honest source and
rich display), the two ideas that resolve it (decoration-over-source; one plugin owns a
feature on both surfaces), a diagram of the whole system, the module dependency
direction, both request lifecycles, and the **seven load-bearing invariants** that must
not be broken. Start here on any first session. ~10 min read.

---

## Core

| Document                                         | Covers                                                                                                                                                                                                                                                           | Open it when                                                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **[editor-core.md](./editor-core.md)**           | `editor/draftly.ts`, `view-plugin.ts`, `theme.ts`, `utils.ts`. The `draftly()` factory and its full config table, extension precedence order, the `disableViewPlugin` gate, facets, the decoration build loop, rebuild triggers, and the swallowed-error caveat. | Changing how the extension bundle is composed, adding a `DraftlyConfig` option, debugging decoration ordering or "my decoration doesn't appear" |
| **[plugin-system.md](./plugin-system.md)**       | `editor/plugin.ts`. The `DraftlyPlugin` / `DecorationPlugin` / `SyntaxPlugin` hierarchy, every method in the contract, the lifecycle hooks, `requiredNodes` dispatch, the `decorationPriority` bands, and the house rules for writing a plugin.                  | Writing any plugin, or extending the base class with a new hook                                                                                 |
| **[preview-pipeline.md](./preview-pipeline.md)** | `preview/`. `preview()` and why it is async, `PreviewRenderer`'s dispatch order, gap preservation in `renderChildren`, `PreviewContext`, `generateCSS()`, how editor styles become preview styles, and the fragile `syntax-theme.ts` internals.                  | Changing static HTML output, debugging preview/editor mismatch, anything touching sanitization or generated CSS                                 |
| **[theming.md](./theming.md)**                   | `createTheme()`, the default/dark/light layer model, nested and comma-separated selectors, `&` handling, the two consumers (`EditorView.theme` vs scoped CSS), `draftlyBaseTheme`, and `markdownResetExtension`.                                                 | Adding or changing any style, or working out why a third-party CodeMirror theme is being overridden                                             |

---

## Plugins

| Document                                       | Covers                                                                                                                                                                                                                                                                                                                | Open it when                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **[plugins-catalog.md](./plugins-catalog.md)** | All 14 built-in plugins in one table (version, priority, LOC, base class, owned nodes), grouped by role, which ones extend the parser, which pull heavy dependencies, and the registration checklist.                                                                                                                 | Finding which plugin owns a markdown construct, or registering a new one |
| **[plugin-table.md](./plugin-table.md)**       | `table-plugin.ts` (1759 LOC) in depth: why tables are hard, the seven-layer internal structure, `ParsedTable` vs `TableInfo`, the three deferred-repair schedulers and their re-entrancy locks, the four-mechanism decoration strategy, the dual keyboard path, text-handling rules, and the nested preview renderer. | **Required reading before any edit to the table plugin**                 |

---

## Supporting

| Document                                           | Covers                                                                                                                                                                                                                                                         | Open it when                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **[build-and-tooling.md](./build-and-tooling.md)** | Bun/Turborepo/tsup toolchain, every command, the task graph, the library build and why CodeMirror is external, the `draftly/src` raw-TS export, the Biome lint/format setup, the Changesets release flow, the **absent test suite**, and the vendored agent skills. | Running or changing a build, shipping a release, or setting up tooling |
| **[web-playground.md](./web-playground.md)**       | `apps/web`. Its role as the primary verification surface, structure, the derived plugin-toggle map, the `VERSION` bump rule for seed content, and an 8-step checklist for verifying a library change.                                                          | Verifying any library change, or working in the app                    |

---

## Conventions for these documents

- **Front-matter line** on every file: last-verified date and commit.
- **Describe mechanism, not just structure.** A file listing is not architecture; explain
  why the pieces are arranged this way.
- **Flag the load-bearing bits.** Anything whose removal breaks the design gets called
  out explicitly.
- **Record known tensions** rather than quietly presenting the code as ideal. Open
  questions belong in [../memory.md](../memory.md); actionable items in
  [../tasks/index.md](../tasks/index.md).
- **Update in the same commit as the code.** A stale architecture doc is worse than none.
- **If reality contradicts a document, stop and ask the developer** before changing
  either. The doc may be describing intent the code has drifted from.
