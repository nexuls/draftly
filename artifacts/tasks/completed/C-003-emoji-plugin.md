# C-003 — Emoji plugin

**Status:** Complete
**Priority:** Medium
**Completed:** commit `3904ad3`
**Reconstructed:** 2026-08-18 from git history — predates the artifact system.

## Problem

No support for `:shortcode:` emoji syntax, which is near-universal in markdown tooling
(GitHub, Slack, Discord) and expected by users writing documentation.

## Outcome

Added `plugins/emoji-plugin.ts` (140 LOC, `DecorationPlugin`, priority 20).

- Extends the Lezer parser via `getMarkdownConfig()` with two new nodes: `Emoji` and
  `EmojiMark`.
- Resolves shortcodes through `node-emoji` (added as a runtime dependency).
- `EmojiWidget` replaces the shortcode with the rendered glyph in the editor; the raw
  `:shortcode:` reappears when the selection enters the node, per the standard
  decoration-retraction rule.
- Implements `renderToHTML()` for static preview, with `requiredNodes = ["Emoji", "EmojiMark"]`.

Registered in `plugins/index.ts` and shipped as part of the `2.0.0` release (`31791b8`).

## Notes

One of the cleanest examples in the codebase of a plugin that adds parser syntax,
decorates it, and renders it statically — a good reference alongside `heading-plugin.ts`
when writing a new plugin that needs its own node types.
