# T-022 — Interactive widgets are not keyboard or screen-reader accessible

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** —

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

- [ ] A task list item can be toggled without a mouse
- [ ] Screen readers announce task state
- [ ] Every interactive widget has an accessible name
- [ ] Link URLs are discoverable without hover (keyboard and touch)
- [ ] Adding focus handling does not break editor focus, selection, or cursor retraction
- [ ] Each widget is documented as decorative or as a control

## Notes

- Test with a real screen reader (NVDA or VoiceOver), not just an axe scan. Automated
  tooling will not catch "the checkbox is `aria-hidden` so it does not exist".
- `packages/ui`'s vendored shadcn components already carry a backlog of a11y warnings from
  the Biome migration (memory Q7). Worth deciding whether this task and that burn-down are
  one effort or two — they are different codebases with different standards, so probably
  two.
- The decorative-vs-control decision in step 5 is the actual deliverable. The rest follows
  from it mechanically.
