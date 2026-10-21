# C-037 — List items pay a paragraph's padding in the editor

**Status:** Complete
**Priority:** Medium
**Created:** 2026-10-21
**Blocked on:** —

## Problem

Lezer wraps every list item's text in a `Paragraph`, so `ParagraphPlugin` padded each item
line with `cm-draftly-paragraph-start` *and* `cm-draftly-paragraph-end` — 1em per item,
both edges on the same line for a single-line item. Tight lists read as loose ones, and
the editor showed roughly four times the gap the preview did.

The preview was already correct, and that is the diagnosis: `ListPlugin`'s theme carries
`.cm-draftly-list li .cm-draftly-paragraph { padding: 0 }`. A descendant selector works
there because preview emits a real `<li>`. The editor's lines are a flat sequence of
`.cm-line` elements with no ancestor to select through, so the override had nowhere to
live and the padding went unopposed.

Developer-reported.

## Approach

`ParagraphPlugin.buildDecorations` skips a `Paragraph` with a `ListItem` anywhere in its
ancestor chain, via a module-level `isListItemBody()`. The decision moves into the
decoration build because CSS cannot reach it — the two surfaces now use different
mechanisms to express the same rule, which the helper's JSDoc states outright so the next
reader does not try to unify them.

The chain is walked in full rather than checking the immediate parent, because the preview
rule it mirrors is a *descendant* selector: a paragraph inside a blockquote inside a list
item is exempt on both surfaces. Walking costs one `node.node` materialisation, only for
`Paragraph` nodes, over a handful of levels.

Rejected:

- **A higher-specificity editor rule in `ListPlugin`** — `.cm-draftly-list-line-ul.cm-draftly-paragraph-start { padding-top: 0 }`
  would win on two classes against one. It is cross-plugin coupling in the direction the
  architecture exists to prevent, and `memory.md` already records what specificity races
  cost in `code-plugin.theme.ts`.
- **Dropping the padding from `ParagraphPlugin` entirely** and letting block spacing come
  from elsewhere. The padding is right for ordinary paragraphs on both surfaces; only list
  items are wrong.

## Affected areas

- `packages/draftly/src/plugins/paragraph-plugin.ts` — the only source file changed.
- `artifacts/architecture/plugins-catalog.md` — the `paragraph` row, which still described
  the plugin as "render-only, no decorations" with 38 LOC. That predates the paragraph
  spacing work that came in with the `logits` migration; corrected rather than left to rot.

Editor-only. No preview output, API, type or theme changed.

## Acceptance

- [x] `tsc --noEmit` clean in `packages/draftly`.
- [x] `biome check` clean on the changed file.
- [x] Decoration placement diffed before and after, over a document covering a two-line
      paragraph, tight items, a nested item, an ordered item, a loose list, a blockquote
      inside an item, a plain blockquote and a trailing paragraph. Every list item line
      carried `start+end` before and carries nothing after; every non-list paragraph is
      unchanged, including the multi-line one whose two edges land on different lines.
- [ ] Verified by eye in the playground. Not done — no browser was driven from this
      session.

## Notes

**Verifying `buildDecorations` needs no browser.** An `EditorState` plus
`ensureSyntaxTree` plus a hand-rolled `DecorationContext` whose `iterateVisible` forwards
to `tree.iterate` is enough to dump decorations per line, and the plugin only touches
`ctx.view.state.doc`, so a `{ state }` stub stands in for the view. That is the shape a
real test for any decoration plugin would take — relevant to T-001.

**A residual difference remains, in the other direction.** `ListPlugin`'s preview theme
has `.cm-draftly-list li { margin-bottom: 0.25rem }` and `.cm-draftly-list { margin: 0.5rem 0 }`.
The editor has no block element to carry either, so it is now ~4px per item tighter than
the preview and lacks the 8px above and below a list. Closing it means adding line
decorations to `ListPlugin` for an item's last line and a list's first and last — a design
change to a second plugin, and the obvious way to reintroduce the gaps this task removed.
Left for the developer to judge against the playground.
