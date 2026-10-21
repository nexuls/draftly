# C-035 — Flush page sheet in a narrow container

**Status:** Complete
**Priority:** Low
**Created:** 2026-10-21
**Blocked on:** —

## Problem

`PageSheet` always rendered as a raised page: outer padding on the scroll container, plus
a border, a radius and a shadow on the sheet. Below Tailwind's `sm` the padding dropped to
`px-3 py-4` but the elevation stayed, so in a narrow pane the sheet became a card floating
in a thin gutter — the gutter ate horizontal room the prose needed, and the shadow had no
space to read as depth.

The breakpoints were the wrong instrument as well. They are viewport-relative, but the
pane's width is not: a split-view column is half the window, so at 1100px of viewport the
two columns are ~550px each and both were still styled as roomy pages.

## Approach

Make the elevation a **container** query. `PageSheet` wraps itself in an `@container`
element, and the outer padding, border, radius, shadow and the wider inner padding all
move behind `@2xl:` (42rem of container width). Below that the sheet is flush: it keeps
`bg-card` and its `px-5 py-8` inner padding, so it fills the pane and the prose still
clears the edge, but nothing says "page on a desk".

Rejected: keeping `sm:`/`md:` and passing an extra prop from `SplitPane`. That makes the
layout a caller's concern and gets it wrong for any other narrow placement.

## Affected areas

- `apps/web/src/routes/playground/panes/page-sheet.tsx` — the only file changed. Both
  `EditorPane` and `PreviewPane` get it for free, on every surface.

## Acceptance

- [x] `tsc --noEmit` clean in `apps/web`.
- [x] `biome check` adds no new diagnostics.
- [ ] Verified by eye in the playground — the dev server starts, but no browser was
      reachable from this session, so the `write`, `read` and `split` surfaces at narrow
      and wide widths are unverified visually.

## Notes

Tailwind v4 ships container queries with no plugin, and `apps/web` overrides no
`--container-*` value, so `@2xl` is the default 42rem. The `@container` marker has to sit
on an element *above* the one carrying the `@2xl:` utilities — variants resolve against
the nearest ancestor container, never the element's own — which is why the component
gained a wrapper div rather than annotating the scroll container in place.
