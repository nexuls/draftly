# C-005 — Table plugin reimagined (v2.0.0)

**Status:** Complete
**Priority:** High
**Completed:** commits `226f388`, `2a1e0d8`, `4eb5c6d`, `e5dc598`
**Reconstructed:** 2026-08-18 from git history — predates the artifact system.

The largest single body of work in the project's recent history, and the most recently
touched code in the repo.

## Problem

GFM tables are uniquely hard in a decoration-over-source editor. A table is plain text
that must stay _visually aligned as the user types_ — which means the plugin has to edit
the document, not just decorate it. Add cell-based navigation, structural edits that
rewrite every line, markdown-inside-cells for preview, and the fact that newlines are
illegal inside cells, and the original implementation could not carry it.

## Outcome

A full rewrite, taking the plugin to `version = "2.0.0"` and 1759 LOC.

**`226f388` — Table Plugin (Re-imagined).** New architecture built around two models:
`ParsedTable` (pure markdown-level, for _producing_ tables) and `TableInfo` /
`TableCellInfo` (document-anchored, for _navigating_ existing ones). Interactive editing:
Tab/arrow/Enter cell navigation, add/remove row and column, hover controls
(`TableControlsWidget`), and `<br />` support inside cells (`TableBreakWidget`).

**`2a1e0d8` — ignore trailing non-table lines.** `splitTableAndTrailingMarkdown()` stops a
paragraph immediately following a table from being absorbed into it.

**`4eb5c6d`, `e5dc598` — clean-architecture refactors.** Reorganised the file into seven
layers, bottom-up: widgets → pure text utilities → table model → document readers →
decorations → mutations → interaction → preview. The two lowest layers have **no
CodeMirror dependency**, deliberately, so the parsing and formatting logic is isolated.

## Key mechanisms established

These look like accidents and are not — all documented in
[`../../architecture/plugin-table.md`](../../architecture/plugin-table.md):

- **The three deferred repairs.** CodeMirror forbids dispatching from inside `update()`,
  but the plugin must edit the document in response to edits. `onViewUpdate` schedules
  `normalizeTables`, `ensureTablePadding`, and `ensureTableSelection` to run afterwards.
- **`pending*View` fields are re-entrancy locks, not caches.** Each repair transaction
  triggers another `onViewUpdate`; removing the guards causes infinite dispatch loops.
- **Annotations tag self-dispatches** (`normalizeAnnotation`, `repairSelectionAnnotation`)
  so the plugin recognises its own edits and skips reprocessing them.
- **Four-mechanism decoration strategy** — `BlockWrapper` for table-wide CSS layout, line
  decorations per row, cell mark decorations from a precomputed 2×3×2 map, and replace
  decorations hiding pipes and the delimiter row, backed by atomic ranges.
- **Dual keyboard registration** — `getKeymap()` _and_ `handleDomKeydown` via
  `domEventHandlers`, because `Prec`-competing extensions would otherwise claim some keys.
- **Nested `PreviewRenderer` per cell.** Cell content is markdown, so preview recursively
  runs a full render per cell. This is the reason `renderToHTML` became async across the
  entire preview pipeline, and the only place a plugin imports from `preview/`.

## Follow-ups

- At 1759 LOC the file is well past the ceiling other plugins respect, though its layers
  are clean enough to split mechanically — see
  [`../ongoing/T-005-decompose-large-plugins.md`](../ongoing/T-005-decompose-large-plugins.md).
  **Ask before doing it**: the rework is recent and a large move would obscure this history.
- `renderWidth()` is not grapheme-aware, so CJK and emoji misalign the raw markdown —
  see [`../ongoing/T-008-table-grapheme-width.md`](../ongoing/T-008-table-grapheme-width.md).
