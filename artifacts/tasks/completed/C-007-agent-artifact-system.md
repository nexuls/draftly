# C-007 — Agent artifact system

**Status:** Complete
**Priority:** High
**Created:** 2026-08-18
**Completed:** 2026-08-18

## Problem

Agents working on Draftly started every session cold: no persistent memory, no map of the
repository, no written architecture, and no task record. Everything had to be re-derived
from ~8.9k LOC of source and 25+ commits, every time — expensive, and unreliable for the
non-obvious constraints (deferred dispatch in the table plugin, the `requiredNodes`
dispatch key, the swallowed decoration errors) that are invisible from a quick read.

`AGENTS.md` and its `CLAUDE.md` symlink existed but were empty.

## Outcome

Analysed the codebase end to end, then created the `artifacts/` knowledge base:

```
artifacts/
├── memory.md                     # cross-session memory: durable facts, open questions, session log
├── repository-map.md             # full repo map + "where to make a change" table
├── architecture/
│   ├── index.md                  # annotated index of the 7 documents below
│   ├── overview.md               # problem, solution, system diagram, 7 invariants
│   ├── editor-core.md            # draftly() factory, view plugin, decoration loop
│   ├── plugin-system.md          # the plugin contract, in full
│   ├── preview-pipeline.md       # static rendering, CSS generation, syntax themes
│   ├── theming.md                # createTheme, the two consumers, base theme
│   ├── plugins-catalog.md        # all 14 built-in plugins
│   ├── plugin-table.md           # deep dive on the 1759 LOC table plugin
│   ├── build-and-tooling.md      # toolchain, commands, release flow
│   └── web-playground.md         # apps/web as the verification surface
└── tasks/
    ├── index.md                  # status tables, lifecycle rules, task template
    ├── completed/                # C-001…C-007
    └── ongoing/                  # T-001…T-008
```

Then wrote `AGENTS.md` as the agent instruction set.

## Decisions

- **Architecture split across 8 documents** rather than one file, so a task can load only
  what it needs. `architecture/index.md` carries a one-line "open it when" for each.
- **`table-plugin.ts` got a dedicated deep dive** — it is the largest file, the most
  recently churned, and contains several mechanisms (re-entrancy locks, deferred
  dispatch, dual keymap registration) that read as accidents if you have not been told
  otherwise.
- **Known problems recorded, not fixed.** The README drift, the server-side sanitization
  gap, the inert `dependencies` field, and the `check-types`/`typecheck` mismatch were all
  written up as tasks and open questions rather than silently corrected — per the
  developer's instruction to ask about anything suspicious or conflicting first.
- **Completed tasks reconstructed from git history** (C-001…C-006) so the record starts
  with context rather than empty. They are explicitly marked as reconstructions.

## Acceptance

- [x] `artifacts/memory.md` with durable facts, open questions, and a session log
- [x] `artifacts/repository-map.md` reflecting the current tree
- [x] `artifacts/architecture/index.md` indexing every architecture document with a description
- [x] `artifacts/architecture/overview.md` covering the whole system
- [x] Per-area architecture documents for each subsystem
- [x] `artifacts/tasks/index.md` with completed and ongoing tables
- [x] Completed tasks recorded in `tasks/completed/`
- [x] Ongoing and proposed work recorded in `tasks/ongoing/`
- [x] `AGENTS.md` written (`CLAUDE.md` symlink already in place)

## Notes

- Six open questions were raised for the developer and remain unanswered; they are listed
  in [`../../memory.md`](../../memory.md#open-questions-for-the-developer) and block
  T-001, T-002, T-005, T-006, and T-007.
