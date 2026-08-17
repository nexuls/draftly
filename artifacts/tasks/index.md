# Task Index

> Last updated: 2026-08-18 · commit `eae4434`
> Single source of truth for what is being worked on and what has shipped.

---

## Ongoing

Upcoming or partially complete. Files live in [`ongoing/`](./ongoing/).

| ID      | Task                                                                                                   | Priority | Status   | Blocked on                                                          |
| ------- | ------------------------------------------------------------------------------------------------------ | -------- | -------- | ------------------------------------------------------------------- |
| `T-001` | [Establish a test suite](./ongoing/T-001-test-suite.md)                                                | High     | Proposed | Developer decision on runner (memory Q5)                            |
| `T-002` | [Fix README ↔ API drift](./ongoing/T-002-readme-api-drift.md)                                          | High     | Proposed | Developer answers on `themeStyle` + async `preview` (memory Q1, Q2) |
| `T-003` | [Make server-side sanitization honest](./ongoing/T-003-server-side-sanitization.md)                    | High     | Proposed | —                                                                   |
| `T-004` | [Dev-mode diagnostics for swallowed decoration errors](./ongoing/T-004-decoration-error-visibility.md) | Medium   | Proposed | —                                                                   |
| `T-005` | [Decompose oversized plugin files](./ongoing/T-005-decompose-large-plugins.md)                         | Medium   | Proposed | Developer approval (memory Q6)                                      |
| `T-006` | [Resolve or remove `plugin.dependencies`](./ongoing/T-006-plugin-dependencies.md)                      | Medium   | Proposed | Developer decision (memory Q3)                                      |
| `T-007` | [Wire up the type-check task](./ongoing/T-007-typecheck-task.md)                                       | Low      | Proposed | Naming decision (memory Q4)                                         |
| `T-008` | [Grapheme-aware table column widths](./ongoing/T-008-table-grapheme-width.md)                          | Low      | Proposed | —                                                                   |

**Nothing is currently in progress.** All ongoing items are proposals awaiting
prioritisation — do not start one without checking with the developer.

---

## Completed

Files live in [`completed/`](./completed/). Reconstructed from git history at artifact
bootstrap, so entries before 2026-08-18 are summaries rather than full task records.

| ID      | Task                                                                                                  | Shipped              |
| ------- | ----------------------------------------------------------------------------------------------------- | -------------------- |
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
