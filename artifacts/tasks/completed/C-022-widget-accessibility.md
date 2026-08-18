# C-022 — Interactive widgets are not keyboard or screen-reader accessible

**Status:** Complete
**Priority:** Medium
**Created:** 2026-08-18
**Completed:** 2026-08-18

## Problem

Every rendered widget is a click target built as a non-focusable element with
`style.cursor = "pointer"` and a bare `click` listener. None has `tabIndex`, a `role`, an
accessible name, or a keyboard handler:

| Widget                | Site                     | Element  | Action on click        |
| --------------------- | ------------------------ | -------- | ---------------------- |
| `ImageWidget`         | `image-plugin.ts:64`     | `figure` | select raw markdown    |
| `LinkTooltipWidget`   | `link-plugin.ts:54`      | `span`   | select / open in tab   |
| `LinkTextWidget`      | `link-plugin.ts:347`     | `span`   | select / open in tab   |
| `InlineMathWidget`    | `math-plugin.ts:78`      | `span`   | select raw markdown    |
| `MathBlockWidget`     | `math-plugin.ts:127`     | `div`    | select raw markdown    |
| `MermaidBlockWidget`  | `mermaid-plugin.ts:106`  | `div`    | select raw markdown    |

The task checkbox is the sharpest case. `list-plugin.ts:53-58` explicitly sets:

```ts
wrap.setAttribute("aria-hidden", "true");
checkbox.tabIndex = -1;
```

So an interactive control that toggles document content is hidden from assistive
technology and unreachable by keyboard. A keyboard user can only toggle a task by editing
the raw `[ ]` text — which requires knowing the markdown, and knowing the checkbox is
there at all, which `aria-hidden` prevents.

Related UX gaps:

- **Link tooltips are hover-only** (`link-plugin.ts:66-73`, `:364-371`). No focus
  equivalent, and nothing at all on touch devices — a tap just selects the markdown, so
  the URL is never discoverable on mobile.
- **Ctrl/Cmd+click to open a link** (`link-plugin.ts:76`) is undiscoverable. Nothing in
  the UI indicates it exists.

## Proposed approach

There is a real design tension here: these widgets live inside a `contenteditable`
surface, where adding focusable children interferes with editor focus and selection
handling. The fix has to respect that, which is why this is not simply "add `tabIndex=0`
everywhere".

1. **Start with the checkbox** — it is the only widget whose action is not otherwise
   reachable, since the others merely reveal syntax the user can reach by moving the
   cursor. Options:
   - Make it genuinely focusable and remove `aria-hidden`, accepting the focus-management
     work inside `contenteditable`; or
   - Keep it decorative and add a **keybinding** to toggle the task under the cursor,
     which fits the plugin architecture better (`getKeymap()` already exists and is
     unused by the list plugin) and works regardless of focus semantics.
   *Recommendation: the keybinding, plus removing `aria-hidden` and giving the checkbox an
   accessible label so the state is at least announced.*
2. **Give every widget an accessible name.** `aria-label` describing what it is and what
   activating it does. Currently a screen reader encountering a rendered formula gets
   KaTeX's own markup with no indication it is interactive.
3. **Make math and mermaid content readable.** KaTeX emits MathML alongside its visual
   output when configured to; check whether the current `renderToString` options
   (`math-plugin.ts:47-53`) produce it, and add `alt`-equivalent text for mermaid
   diagrams from the diagram source.
4. **Add focus-visible styling** to the existing hover styles so tooltips appear on focus
   as well as hover, and make the Ctrl+click affordance discoverable — a hint in the
   tooltip is the cheapest option.
5. **Audit against the editor's own semantics.** CodeMirror already exposes the document
   through its own accessibility model; widgets that merely *display* content that exists
   in the document may be correctly marked decorative. Establish which widgets are
   decorative and which are controls, and document the distinction — that decision is what
   makes the rest of the work straightforward.

## Affected areas

- `plugins/list-plugin.ts` — `TaskCheckboxWidget`, plus `getKeymap()` if the keybinding
  route is taken
- `plugins/image-plugin.ts`, `plugins/link-plugin.ts`, `plugins/math-plugin.ts`,
  `plugins/mermaid-plugin.ts` — labels and focus handling
- `artifacts/architecture/plugin-system.md` — a decorative-vs-control rule for widgets
- `AGENTS.md` — plugin authoring checklist
- `README.md` — document the task-toggle keybinding if added

## Acceptance

- [x] A task list item can be toggled without a mouse — `Mod-Enter`
- [x] Screen readers announce task state — as an image with a state label, not as a
      checkbox; see the decorative-vs-control decision
- [x] Every interactive widget has an accessible name
- [x] Link URLs are discoverable without hover (keyboard and touch)
- [x] Adding focus handling does not break editor focus, selection, or cursor retraction —
      trivially: **no focus handling was added**, which is the decision below
- [x] Each widget is documented as decorative or as a control

**Not verified with a real screen reader.** The task note is explicit that an axe scan
would not catch the original bug, and neither would a type-check. NVDA/VoiceOver passes
are still outstanding and are the right next step.

## Outcome

Landed as `feat(draftly): Make rendered widgets reachable and announceable`.

### The decorative-vs-control decision

Step 5 was named as the actual deliverable, and it is what everything else fell out of.

| Widget                 | Classification | Reasoning                                                             |
| ---------------------- | -------------- | --------------------------------------------------------------------- |
| `TaskCheckboxWidget`   | **Control**    | Mutates the document, and the raw `[ ]` it replaces is hidden          |
| `ImageWidget`          | Decorative     | Click only reveals syntax the cursor can already reach                 |
| `LinkTooltipWidget`    | Decorative     | Same, plus a Ctrl+Click shortcut for something the URL text also does  |
| `LinkTextWidget`       | Decorative     | Same                                                                   |
| `InlineMathWidget`     | Decorative     | Same                                                                   |
| `MathBlockWidget`      | Decorative     | Same                                                                   |
| `MermaidBlockWidget`   | Decorative     | Same                                                                   |

The line: **a widget is a control if activating it is the only way to do something.**
Everything except the checkbox merely reveals markdown the user can reach by moving the
cursor — CodeMirror's own accessibility model already exposes that text. Those widgets
need an accessible *name* so their content is announced; they do not need to be focusable,
and making them focusable inside `contenteditable` would fight the editor's focus and
selection handling for no gain.

### The checkbox

Took the recommended route: **keyboard command, not a focusable control.**

- `Mod-Enter` toggles every task on the selected lines, via `getKeymap()` — which the list
  plugin already had and which works regardless of focus semantics. Mixed selections
  normalise to checked, matching how checkbox groups behave elsewhere.
- `aria-hidden="true"` removed from the wrapper, replaced with `role="img"` and an
  `aria-label` of "Task complete" / "Task incomplete". The inner `<input>` is now the
  `aria-hidden` element, since it is presentation for a control that lives on the keymap.

`role="img"` rather than `role="checkbox"` is deliberate: announcing it as a checkbox
promises an interaction the element does not offer. It describes the state honestly and
the keybinding provides the operation.

### Accessible names

- **Mermaid** — `role="img"` with a label derived from the diagram source, truncated. The
  rendered SVG has no text alternative and the source it came from is hidden by the
  decoration, so this is the only description available. Imperfect, and the difference
  between "graphic" and nothing.
- **Image** — the figure falls back to alt text when there is no title. An unlabelled
  `role="figure"` announces as an anonymous group, which is worse than repeating the
  image's own description.
- **Math** — **nothing added, deliberately.** Verified that KaTeX's default output is
  `htmlAndMathml`: it emits a MathML representation beside the visual layer and marks the
  visual layer `aria-hidden`. Formulas were already readable. An `aria-label` on the
  container would have overridden the MathML with a flat string and made this worse. The
  finding is written into `renderMath`'s JSDoc so it is not "fixed" later.
- **Errors** — math and mermaid failure states are `role="alert"`. Image errors already
  were. `className +=` became `classList.add` in the same places.

### Link discoverability

Both link widgets set a native `title` carrying the URL and the "Ctrl+Click to open" hint.
`title` is announced by screen readers and surfaces on long-press, which covers keyboard
and touch where the hover-only tooltip covered neither. It is also the cheapest fix for
proposal item 4's second half — the Ctrl+Click affordance was previously signalled nowhere
at all. `LinkTextWidget` additionally gets an `aria-label` naming both the text and the
target.

### Not done

- **Focus-visible styling and tooltip-on-focus** (item 4's first half). It requires
  focusable widgets, which the decorative-vs-control decision rules out. Revisit only if
  the decision changes.
- **Real screen-reader testing.** Called out in the task notes as the thing automated
  tooling cannot replace, and it remains outstanding.
- The `packages/ui` shadcn a11y backlog (memory Q7) is a separate effort, as the notes
  suggested — different codebase, different standards.

## Notes

- Test with a real screen reader (NVDA or VoiceOver), not just an axe scan. Automated
  tooling will not catch "the checkbox is `aria-hidden` so it does not exist".
- `packages/ui`'s vendored shadcn components already carry a backlog of a11y warnings from
  the Biome migration (memory Q7). Worth deciding whether this task and that burn-down are
  one effort or two — they are different codebases with different standards, so probably
  two.
- The decorative-vs-control decision in step 5 is the actual deliverable. The rest follows
  from it mechanically.
