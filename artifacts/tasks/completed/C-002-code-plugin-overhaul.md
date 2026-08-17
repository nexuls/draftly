# C-002 — Code plugin overhaul + diff view

**Status:** Complete
**Priority:** High
**Completed:** commits `28adf9c`, `3440790`, `a63acd5`, `361c9fb`, `b203553`, `e716bb7`, `c2808ef`
**Reconstructed:** 2026-08-18 from git history — predates the artifact system.

## Problem

`CodePlugin` had accumulated features (language detection, line numbers, copy button,
captions, text highlighting) without a matching structure. It also lacked diff rendering,
which is a common need for documentation and changelogs.

## Outcome

A multi-commit rework that grew the plugin to its current 1368 LOC plus a 426 LOC theme file.

- **Refactors** (`28adf9c`, `3440790`, `a63acd5`) — restructured decoration building,
  highlighting, and widget construction.
- **Diff view** (`361c9fb`, `e716bb7`) — `DiffLineKind` (`normal | addition | deletion`),
  `DiffLineState`, and `DiffDisplayLineNumbers` render added/removed lines with correct
  line numbering on both sides of the diff.
- **Theme extraction** (`b203553`) — moved styles to `code-plugin.theme.ts`, establishing
  the precedent for splitting a plugin's theme out when it dominates the file.
- **Naming** (`c2808ef`) — `line-numbers` → `showLineNumbers` in the code-info options, for
  consistency with the other boolean flags.
- Code-block info strings gained quoted-attribute parsing (`QUOTED_INFO_PATTERN`) and
  text-range highlighting (`TEXT_HIGHLIGHT_PATTERN`, e.g. `/needle/1-3,7`).

## Durable consequences

- `code-plugin.theme.ts` is the reference for the theme-extraction pattern; follow it when
  any other plugin's styles outgrow its file.
- The plugin is now the second largest in the codebase and a candidate for directory
  decomposition — see [`../ongoing/T-005-decompose-large-plugins.md`](../ongoing/T-005-decompose-large-plugins.md).
