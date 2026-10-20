# C-032 — Split view: editor and preview side by side

**Status:** Complete
**Priority:** Medium
**Created:** 2026-10-21
**Blocked on:** —

## Problem

The playground's four surfaces are mutually exclusive. Checking editor/preview parity —
the property the whole plugin architecture exists to guarantee — means toggling between
`write` and `read` and holding the previous surface in your head. That is exactly the
comparison an agent is asked to make in step 3 and step 4 of the verification checklist,
and the UI makes it a memory test.

Developer's framing: "view the editor and the preview in a split view, so we can compare
what it looks [like] and what it serves."

## Proposed approach

A fifth `PlaygroundMode`, `"split"`, rendering `EditorPane` and `PreviewPane` in two
columns.

- **Composition, not a new pane.** `panes/split-pane.tsx` takes the two panes as
  `ReactNode` props and owns nothing but the layout. It cannot drift from either pane,
  because it does not know what they are.
- **`split` is a `write` surface for extension purposes.** `useEditorExtensions` and
  `EditorPane` both branch on `mode === "source"`, so `"split"` falls through to the
  decorated editor with no change to either.
- **`usePreview` must opt in.** Its `enabled` flag lists the modes that need a render;
  omitting `split` would show an empty preview column and nothing would fail loudly.
- Vertical stack below `md`, two columns from `md` up. Two 72ch sheets do not fit side by
  side on a phone.

**Rejected: scroll synchronisation.** `preview()` output carries no mapping back to source
lines — no `data-line` attributes, no node offsets — so correlating a scroll position in
the editor with one in the rendered HTML would mean guessing from heading order. Logged as
a follow-up rather than approximated.

## Affected areas

| File | Change |
| --- | --- |
| `routes/playground/types.ts` | `"split"` added to `PlaygroundMode` |
| `routes/playground/top-rail.tsx` | Fifth segment in `MODES` |
| `routes/playground/panes/split-pane.tsx` | New |
| `routes/playground/playground-route.tsx` | Routing, `MODE_NOTES`, `usePreview` gate |
| `artifacts/architecture/web-playground.md` | Mode table, structure, checklist |

## Acceptance

- [x] Split appears in the surface rail and shows editor left, preview right.
- [x] Typing in the split editor updates the preview column after the debounce.
- [x] The two columns scroll independently.
- [x] Stacks vertically below `md`.
- [x] Decorations retract on caret entry in the split editor, as in `write`.
- [x] `bun run lint` and `bun run typecheck` clean.

## Notes

**Verified by script, not by eye.** Playwright drove the real dev server at 1440px in both
themes and at 390px, and asserted the behaviour rather than just screenshotting it:

| Check | Result |
| --- | --- |
| Typing `# ZZPARITYZZ` in the split editor | reaches the preview column as `<h1>` |
| Caret off the heading line | `Draftly - See What You Get` |
| Caret on the heading line | `## Draftly - See What You Get` — retraction intact |
| Scrolling the preview column to 600 | editor column stayed at 7093 |
| Console | no errors on any viewport |

**The caret assertion needed a second attempt and that is the lesson.** The first pass
typed into the editor and then read `.cm-line` first — but CodeMirror virtualizes, so after
`Control+End` the first rendered line is not line 1, and the caret was never where the test
assumed. It reported a pass that meant nothing. Locating the heading line by its text and
clicking it directly is what actually exercises the retraction.

**Follow-up not taken: scroll synchronisation.** Named here so it is not re-litigated from
scratch. It needs a source-line mapping that `preview()` does not emit — the honest version
is `data-line` attributes written by the renderer, which is a library change with a public
output-shape consequence, not a playground tweak.
