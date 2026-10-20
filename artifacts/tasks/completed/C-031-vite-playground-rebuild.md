# C-031 — Replace Next.js with Vite and rebuild the playground

**Status:** Complete
**Priority:** High
**Created:** 2026-10-20
**Shipped:** 2026-10-21 (`1e8f41d`…`4cf0eed`)
**Blocked on:** —

## Problem

Two separate things, asked for together by the developer.

1. `apps/web` was a Next.js 16 App Router app that used none of Next's server-side
   surface. It is a single-page consumer of the library, and the framework was costing a
   build step and a transpile hop for nothing.
2. The playground's UI "looks too cheap" — a 566-line page component, boxed panels with
   uniform borders and radii, and shadcn defaults straight out of the box.

## Approach

Decided with the developer before starting:

| Question                  | Answer                                           |
| ------------------------- | ------------------------------------------------ |
| Fate of `packages/ui`     | Delete it; shadcn moves inside the Vite app       |
| Routes                    | Landing + playground, on `react-router`           |
| Aesthetic direction       | Editorial / typographic                           |

### Design

Grounded in what the library actually does rather than in a generic "writing app" look.
Retraction — source that is always really there and decoration that pulls back under the
caret — is a *proofreading* idea, so the surface is a proof sheet: cool paper, ink-blue
text, blue pencil for anything actionable, red pencil reserved for destructive actions.

Two families: Inter for the interface *and* the prose, JetBrains Mono for text that is
genuinely source or a measurement. The rebuild first shipped a serif (Newsreader) in both
roles; that was reverted to Inter on request. The editorial read now comes from the
palette, the hairlines and the single raised page rather than from the face.

The generic-AI-design defaults were avoided on purpose: not the cream-paper/terracotta
palette, not zero-radius broadsheet rules, not a grid of identical rounded cards. One
raised surface (the page), hairlines everywhere else.

### Structure

The route file became composition only, with behaviour in hooks (`use-documents`,
`use-preview`, `use-editor-extensions`) and panes. Full layout in
[`../../architecture/web-playground.md`](../../architecture/web-playground.md).

## Outcome

Six commits:

| Commit    | What                                                        |
| --------- | ----------------------------------------------------------- |
| `1e8f41d` | Vite toolchain in, Next.js and both its presets out          |
| `09dca09` | Editorial design system + the app's own CodeMirror theme     |
| `9d47115` | Shell, routing, theme provider replacing `next-themes`       |
| `a1e43b0` | Playground rebuild                                           |
| `85d32c9` | Landing page with the live hero editor                       |
| `4cf0eed` | `@workspace/ui` removed                                      |

### Bugs fixed along the way

- **The syntax tree stayed empty until the next keystroke.** Toggling it reconfigures the
  extensions rather than remounting, so the view plugin's constructor — the only
  unprompted `onNodesChange` caller — never runs again, and `update()` rebuilds the tree
  only on a doc/selection/viewport change. Fixed by re-dispatching the current selection
  on the next frame.
- **`preview()` and `generateCSS()` were passed different `wrapperClass` strings.** It
  worked only because the longer contained the shorter. Now one constant feeds both.
- **Document mutations ran side effects inside `setState` updaters**, which React may
  invoke twice. Rewritten to compute from a ref.

### Verification

No browser in the agent environment, but Playwright's Chromium is on the machine, so the
8-step playground checklist was run by script against `localhost:5173` with screenshots:
Write, Read, Export→HTML, Export→CSS, Source, a plugin toggled off, the syntax tree, both
themes, and a 390px viewport. No console or page errors on any surface. Repo-wide
`bun run build`, `bun run lint` and both `typecheck`s are green.

## Notes

- Three shadcn primitives (`dropdown-menu`, `scroll-area`, `separator`) were pulled by the
  CLI and then removed — nothing imported them, and vendored dead code is still dead code.
- The current shadcn registry writes `import { cn } from "cn"` and installs a `cn` package
  plus the unified `radix-ui` package. The `cn` import was repointed at `@/lib/utils` and
  the stray dependency dropped; `radix-ui` was kept, since the generated components import
  from it.
- `heading-plugin.ts` hardcodes `fontFamily: "sans-serif"`, which is why editor and
  preview headings do not take the app's serif. Left alone and logged as open question 18
  — it is library code, outside this task, and contradicts the token layer rather than
  simply lacking one.
