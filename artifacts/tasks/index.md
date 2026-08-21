# Task Index

> Last updated: 2026-08-21 · commit `cafc3cc`
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
| `T-015` | [Share in-flight Mermaid renders](./ongoing/T-015-memoize-expensive-renders.md)          | Low      | Proposed | —                               |

**T-011 and T-012 have both landed** (C-016, C-017): 39.2 ms → 0.40 ms per decoration
build on a 5,000-line document. Its one open acceptance criterion is the playground
checklist, which needs a browser.

**T-015 was re-measured and mostly dropped.** Its premise did not survive C-016 and C-017:
`emoji.emojify` costs 0.36 µs, so even 100 visible shortcodes add 0.036 ms to a 0.40 ms
decoration build, and `renderMath` no longer runs per keystroke now that widgets are
reused. Both caches are dropped as not worth the code, along with the proposed `lib/lru.ts`.
The task is rescoped to the one part that was never a caching argument — two mermaid
widgets with the same definition should share one in-flight render. Left unimplemented
because its failure modes cannot be checked without a browser.

### Lifecycle & memory

_Nothing outstanding._

**T-016, T-018 and T-017 have all landed** (C-018, C-019, C-026).
`DraftlyPlugin.onViewDestroy` exists, the view plugin implements `destroy()`, the async
widget paths are guarded, and plugin instances are now per-editor via
`createEssentialPlugins()` / `createAllPlugins()`. The deprecated `essentialPlugins` /
`allPlugins` arrays were removed in **C-028**, a major.

### Bundle size

_Nothing outstanding._

`T-020` landed as **C-024** for its first three steps, and its fourth became **T-028**,
which has now landed as **C-027**. `MermaidPlugin`, `MathPlugin` and `EmojiPlugin` sit
behind `draftly/plugins/{mermaid,math,emoji}`, and `createAllPlugins()` behind
`draftly/plugins/all`.

C-027 turned out to be far more than a tidy-up. `import { HeadingPlugin } from
"draftly/plugins"` bundled to **8.0 MB** — one small plugin dragging in mermaid, KaTeX and
node-emoji, because tsup emitted all 14 plugins as one chunk whose top level imported all
three. It is now **2.5 MB** with none of them. C-024's `sideEffects: false` could not have
caught this: a bundler cannot drop a third-party package it cannot prove pure, and CJS has
no tree-shaking at all.

C-026's deprecation cycle is over: the arrays were removed in **C-028**.

**T-027 has landed** as **C-025** — the KaTeX stylesheet is now a generated TypeScript
constant, so no bundler-specific specifier reaches `dist/`. It surfaced open question 17
(KaTeX's font URLs are relative and have never resolved for consumers), which is a
separate defect.

### UX & accessibility

| ID      | Task                                                                              | Priority | Status   | Blocked on                        |
| ------- | ----------------------------------------------------------------------------------- | -------- | -------- | ----------------------------------- |
| `T-026` | [`ThemeEnum.AUTO` ignores the system theme](./ongoing/T-026-theme-auto-system-detection.md) | Medium   | Proposed | Developer decision — behaviour change |

### Code quality & tooling

| ID      | Task                                                                                        | Priority | Status   | Blocked on                            |
| ------- | ------------------------------------------------------------------------------------------- | -------- | -------- | --------------------------------------- |
| `T-001` | [Establish a test suite](./ongoing/T-001-test-suite.md)                                     | High     | Proposed | Developer decision on runner (memory Q5) |
| `T-005` | [Decompose oversized plugin files](./ongoing/T-005-decompose-large-plugins.md)              | Medium   | Proposed | Developer approval (memory Q6)          |
| `T-006` | [Resolve or remove `plugin.dependencies`](./ongoing/T-006-plugin-dependencies.md)           | Medium   | Proposed | Developer decision (memory Q3)          |
| `T-024` | [Dead configuration surfaces](./ongoing/T-024-dead-configuration-surfaces.md)               | Low      | Proposed | Developer decision (memory Q8)          |
| `T-007` | [Wire up the type-check task](./ongoing/T-007-typecheck-task.md)                            | Low      | Proposed | Naming decision (memory Q4)             |

**Implementation of the unblocked items began 2026-08-18**, on the developer's instruction
to work the ongoing list. Rows still marked `Proposed` with a "Developer decision" in the
_Blocked on_ column are untouched and stay that way until answered — see the open questions
in [`../memory.md`](../memory.md#open-questions-for-the-developer).

### Suggested order

Every task with an unblocked path has now landed. What remains is the nine tasks whose
_Blocked on_ column names a developer decision, plus these two follow-ups created by
completed work:

1. **Remove the deprecated plugin arrays** — a major; C-026's deprecation cycle.
2. **Open question 17** — KaTeX's font URLs, from C-025.

`T-001` (a test suite) still cuts across all of it.

`T-001` cuts across all of it. T-011, T-012 and T-014 are exactly the changes that are
hard to verify by eye in the playground, and the pure layers they touch are the testable
ones — an argument for answering memory Q5 before starting rather than after.

### Cross-repo

| Plan                                                              | Priority | Status   | Blocked on                |
| ----------------------------------------------------------------- | -------- | -------- | ------------------------- |
| [Migrate the `logits` fork's improvements](./logits-migration-plan.md) | High | **Complete** | — |

All nine workstreams landed (`38df166`…`5b9fac7`). The design-token layer, shared base
styles, documented shortcuts, paragraph spacing and five bug fixes are in; the fork's
80-column reformat and app-specific values were rejected as planned. Two findings are now
open questions 15 (the LaTeX parser's AGPL licence) and 16 (plugin themes emit each
surface's rules to both).

---

## Completed

Files live in [`completed/`](./completed/). Reconstructed from git history at artifact
bootstrap, so entries before 2026-08-18 are summaries rather than full task records.

| ID      | Task                                                                                                  | Shipped              |
| ------- | ----------------------------------------------------------------------------------------------------- | -------------------- |
| `C-028` | [Remove the deprecated plugin arrays](./completed/C-028-remove-deprecated-plugin-arrays.md) | 2026-08-21 |
| `C-027` | [Split heavy plugins behind entry points](./completed/C-027-heavy-plugin-entry-points.md) | 2026-08-19           |
| `C-026` | [Plugin collections are shared singletons](./completed/C-026-plugin-instance-scoping.md) | 2026-08-18           |
| `C-025` | [`dist/` has an unresolvable `?raw` CSS import](./completed/C-025-katex-raw-css-import.md) | 2026-08-18           |
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
