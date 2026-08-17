# T-005 — Decompose oversized plugin files

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** Developer approval — memory Q6

## Problem

Two plugin files are far past the size every other plugin respects:

| File                      | LOC  | Next largest            |
| ------------------------- | ---- | ----------------------- |
| `plugins/table-plugin.ts` | 1759 |                         |
| `plugins/code-plugin.ts`  | 1368 | `math-plugin.ts` at 526 |

Eleven of the fourteen plugins are under 510 LOC. These two hold roughly a third of the
library's source between them.

Both already have clean internal layering — the work is mechanical, not a redesign:

- `table-plugin.ts` separates into widgets, pure text utilities, model, document readers,
  decorations, mutations/commands, and preview rendering. The pure layers have no
  CodeMirror dependency at all.
- `code-plugin.ts` already had its theme extracted to `code-plugin.theme.ts` (426 LOC) —
  the precedent for this split exists in the codebase.

The cost of leaving them: they are hard to navigate, hard to review, and — most
concretely — the pure logic inside them is hard to test in isolation, which blocks T-001.

## Proposed approach

Convert each into a directory, preserving the public export exactly.

```
plugins/table/                      plugins/code/
├── index.ts       # TablePlugin    ├── index.ts       # CodePlugin
├── widgets.ts                      ├── widgets.ts     # header, caption widgets
├── text-utils.ts  # pure           ├── diff.ts        # diff-view logic
├── model.ts       # ParsedTable    ├── info.ts        # code-info parsing, highlights
├── document.ts    # TableInfo      ├── preview.ts
├── decorations.ts                  └── theme.ts       # from code-plugin.theme.ts
├── commands.ts
├── preview.ts
└── theme.ts
```

Constraints:

- **Pure move only.** No behaviour change, no renames, no "while I'm here" fixes. Any
  bug found goes in a separate task and a separate commit.
- `plugins/index.ts` imports stay identical (`./table` resolves to `./table/index.ts`).
- One plugin per commit series; do not move both in one commit.
- Do this **before** T-001's table utility tests if both are approved — testing against
  the final structure avoids rewriting the imports twice.

## Affected areas

- `packages/draftly/src/plugins/table-plugin.ts` → `plugins/table/`
- `packages/draftly/src/plugins/code-plugin.ts` + `code-plugin.theme.ts` → `plugins/code/`
- `artifacts/architecture/plugin-table.md` — update the file map
- `artifacts/architecture/plugins-catalog.md` — update the LOC table
- `artifacts/repository-map.md` — update the source tree

## Acceptance

- [ ] `bun run build` produces equivalent output; bundle size does not regress
- [ ] Public exports from `draftly/plugins` are byte-for-byte identical in shape
- [ ] No file in the new directories exceeds ~500 LOC
- [ ] Playground verification passes for tables and code blocks on both surfaces
- [ ] Architecture and repository-map docs updated in the same commit series

## Notes

- **Ask before starting.** The table plugin was reworked across `226f388`…`e5dc598` very
  recently; a large file move immediately after would make that history harder to follow
  with `git log --follow`. The developer may prefer to let it settle.
