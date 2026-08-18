# Task Index

> Last updated: 2026-08-18 · commit `d1bf639`
> Single source of truth for what is being worked on and what has shipped.

---

## Ongoing

Upcoming or partially complete. Files live in [`ongoing/`](./ongoing/).

`T-009`–`T-026` came out of the full-codebase audit on 2026-08-18. They are grouped below
by theme rather than by ID, because within each group the sequencing matters.

### Correctness & security

| ID      | Task                                                                                        | Priority | Status   | Blocked on                                             |
| ------- | ------------------------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------- |
| `T-002` | [Fix README ↔ API drift](./ongoing/T-002-readme-api-drift.md)                                | High     | Proposed | Developer answers (memory Q1, Q2)                       |

**T-009, T-010 and T-003 were one story, and all three have landed** (C-011, C-012,
C-013). `sanitize: true` now means something in the browser. On the server it means
something only if you also pass `sanitizer` — see open question 14 for whether the
no-sanitizer fallback should escape rather than pass through.

### Performance

| ID      | Task                                                                                     | Priority | Status   | Blocked on                    |
| ------- | ----------------------------------------------------------------------------------------- | -------- | -------- | ------------------------------- |
| `T-013` | [Stop building the debug node tree eagerly](./ongoing/T-013-lazy-node-tree.md)           | Medium   | Proposed | API decision (see task)         |
| `T-015` | [Memoize KaTeX / Mermaid / emoji renders](./ongoing/T-015-memoize-expensive-renders.md)  | Medium   | Proposed | Re-measure — C-016/C-017 landed |

**T-011 and T-012 have both landed** (C-016, C-017): 39.2 ms → 0.40 ms per decoration
build on a 5,000-line document. Its one open acceptance criterion is the playground
checklist, which needs a browser. T-015's premise should be re-measured before starting: it
assumed widgets re-render constantly, and after C-017 they no longer do.

### Lifecycle & memory

| ID      | Task                                                                            | Priority | Status   | Blocked on                          |
| ------- | --------------------------------------------------------------------------------- | -------- | -------- | ------------------------------------- |
| `T-016` | [Add a teardown lifecycle](./ongoing/T-016-plugin-teardown-lifecycle.md)        | High     | Proposed | —                                     |
| `T-017` | [Plugin collections are shared singletons](./ongoing/T-017-plugin-instance-scoping.md) | High     | Proposed | Developer decision — public API        |
| `T-018` | [Guard widget async work](./ongoing/T-018-widget-async-robustness.md)           | Medium   | Proposed | T-016                                 |

**T-016 enables the other two.** There is currently no `destroy()` anywhere in the library.

### Bundle size

| ID      | Task                                                              | Priority | Status   | Blocked on |
| ------- | ------------------------------------------------------------------- | -------- | -------- | ------------ |
| `T-020` | [Barrel pulls in Mermaid and KaTeX](./ongoing/T-020-bundle-size.md) | High     | Proposed | —            |

Overlaps T-017 — both change `plugins/index.ts` exports. If both are approved, coordinate
into one API change and one changeset.

### UX & accessibility

| ID      | Task                                                                              | Priority | Status   | Blocked on                        |
| ------- | ----------------------------------------------------------------------------------- | -------- | -------- | ----------------------------------- |
| `T-022` | [Widgets are not keyboard accessible](./ongoing/T-022-widget-accessibility.md)    | Medium   | Proposed | —                                   |
| `T-026` | [`ThemeEnum.AUTO` ignores the system theme](./ongoing/T-026-theme-auto-system-detection.md) | Medium   | Proposed | Developer decision — behaviour change |
| `T-021` | [Playground preview race & word count](./ongoing/T-021-playground-preview-race.md) | Low      | Proposed | —                                   |

### Code quality & tooling

| ID      | Task                                                                                        | Priority | Status   | Blocked on                            |
| ------- | ------------------------------------------------------------------------------------------- | -------- | -------- | --------------------------------------- |
| `T-001` | [Establish a test suite](./ongoing/T-001-test-suite.md)                                     | High     | Proposed | Developer decision on runner (memory Q5) |
| `T-004` | [Dev-mode diagnostics for swallowed errors](./ongoing/T-004-decoration-error-visibility.md) | Medium   | Proposed | —                                       |
| `T-005` | [Decompose oversized plugin files](./ongoing/T-005-decompose-large-plugins.md)              | Medium   | Proposed | Developer approval (memory Q6)          |
| `T-006` | [Resolve or remove `plugin.dependencies`](./ongoing/T-006-plugin-dependencies.md)           | Medium   | Proposed | Developer decision (memory Q3)          |
| `T-024` | [Dead configuration surfaces](./ongoing/T-024-dead-configuration-surfaces.md)               | Low      | Proposed | Developer decision (memory Q8)          |
| `T-007` | [Wire up the type-check task](./ongoing/T-007-typecheck-task.md)                            | Low      | Proposed | Naming decision (memory Q4)             |
| `T-008` | [Grapheme-aware table column widths](./ongoing/T-008-table-grapheme-width.md)               | Low      | Proposed | —                                       |

**Implementation of the unblocked items began 2026-08-18**, on the developer's instruction
to work the ongoing list. Rows still marked `Proposed` with a "Developer decision" in the
_Blocked on_ column are untouched and stay that way until answered — see the open questions
in [`../memory.md`](../memory.md#open-questions-for-the-developer).

### Suggested order

If the developer wants a single sequence rather than a set of groups:

1. `T-016` → `T-017` → `T-018` — lifecycle, in that order
2. `T-020` — bundle size, coordinated with T-017 if both land
3. `T-021` — small, independent, low risk
4. everything else, re-prioritised once the above is known

`T-001` cuts across all of it. T-011, T-012 and T-014 are exactly the changes that are
hard to verify by eye in the playground, and the pure layers they touch are the testable
ones — an argument for answering memory Q5 before starting rather than after.

---

## Completed

Files live in [`completed/`](./completed/). Reconstructed from git history at artifact
bootstrap, so entries before 2026-08-18 are summaries rather than full task records.

| ID      | Task                                                                                                  | Shipped              |
| ------- | ----------------------------------------------------------------------------------------------------- | -------------------- |
| `C-015` | [Redundant work in the preview renderer](./completed/C-015-preview-renderer-redundant-work.md)        | 2026-08-18           |
| `C-014` | [Preview dispatch ignores `decorationPriority`](./completed/C-014-preview-dispatch-priority.md)       | 2026-08-18           |
| `C-013` | [Make server-side sanitization honest](./completed/C-013-server-side-sanitization.md)                 | 2026-08-18           |
| `C-012` | [Preview emits raw HTML for unhandled nodes](./completed/C-012-preview-raw-leaf-output.md)            | 2026-08-18           |
| `C-011` | [Escape attribute values in `renderToHTML`](./completed/C-011-preview-attribute-escaping.md)          | 2026-08-18           |
| `C-010` | [Theme rebuild grows the stylesheet](./completed/C-010-theme-stylesheet-growth.md)                     | 2026-08-18           |
| `C-009` | [Harden `createTheme` / `deepMerge`](./completed/C-009-theme-utils-hardening.md)                       | 2026-08-18           |
| `C-008` | [Replace ESLint + Prettier with Biome](./completed/C-008-biome-migration.md)                          | 2026-08-18           |
| `C-007` | [Agent artifact system](./completed/C-007-agent-artifact-system.md)                                   | 2026-08-18           |
| `C-006` | [Vendored agent skills](./completed/C-006-agent-skills.md)                                            | `eae4434`            |
| `C-005` | [Table plugin reimagined (v2.0.0)](./completed/C-005-table-plugin-v2.md)                              | `226f388`…`e5dc598`  |
| `C-004` | [Nested and comma-separated theme selectors](./completed/C-004-nested-theme-selectors.md)             | `f22824c`, `1ad0f3d` |
| `C-003` | [Emoji plugin](./completed/C-003-emoji-plugin.md)                                                     | `3904ad3`            |
| `C-002` | [Code plugin overhaul + diff view](./completed/C-002-code-plugin-overhaul.md)                         | `361c9fb`…`e716bb7`  |
| `C-001` | [Preview syntax highlighting via CodeMirror themes](./completed/C-001-preview-syntax-highlighting.md) | `17cdf9b`, `dab22ab` |

---

## Working with tasks

### Lifecycle

```
Proposed  →  In Progress  →  Complete
                   ↓
               Blocked / Dropped
```

1. **Create** — add a file in `ongoing/` using the template below, add a row here.
2. **Start** — set status to `In Progress` in both the file and this index.
3. **Finish** — move the file to `completed/`, rename `T-NNN` → `C-NNN`, fill in the
   outcome, and move its row to the Completed table.
4. **Drop** — leave the file in `ongoing/` with status `Dropped` and a reason. Do not
   delete it; the reasoning is the value.

### Rules

- One task file per **coherent unit of work**, matching one logical commit or a short
  series of related commits. If a task needs three unrelated commits, it is three tasks.
- IDs are never reused. `T-NNN` while ongoing, `C-NNN` when complete.
- Update the task file **as you work**, not at the end — a half-finished task with good
  notes is far more useful to the next session than a perfect one written from memory.
- Anything durable you learn goes to [`../memory.md`](../memory.md); anything structural
  goes to [`../architecture/`](../architecture/). Task files hold the _work_, not the
  knowledge.

### Template

```markdown
# T-NNN — <title>

**Status:** Proposed | In Progress | Blocked | Complete | Dropped
**Priority:** High | Medium | Low
**Created:** YYYY-MM-DD
**Blocked on:** <what, or —>

## Problem

What is wrong or missing, and why it matters.

## Proposed approach

How to solve it. Note alternatives considered and why they lost.

## Affected areas

Files, modules, and which architecture docs will need updating.

## Acceptance

Concrete, checkable conditions for done.

## Notes

Running log. Append as you work — findings, dead ends, decisions.
```
