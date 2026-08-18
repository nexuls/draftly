# T-011 — Scope decoration building to the visible viewport

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
**Blocked on:** —

## Problem

`editor/view-plugin.ts:36` is documented as:

```ts
/**
 * Build decorations for the visible viewport
 */
function buildDecorations(view: EditorView, plugins: DraftlyPlugin[] = []): DecorationSet
```

It does not do that. **`view.visibleRanges` is not referenced anywhere in the library.**
Every plugin calls `syntaxTree(view.state).iterate({ enter })` with no `from`/`to` bounds:

| Plugin    | Site                    | Plugin | Site                    |
| --------- | ----------------------- | ------ | ----------------------- |
| heading   | `heading-plugin.ts:81`  | image  | `image-plugin.ts:249`   |
| inline    | `inline-plugin.ts:199`  | math   | `math-plugin.ts:317`    |
| link      | `link-plugin.ts:224`    | mermaid| `mermaid-plugin.ts:256` |
| list      | `list-plugin.ts:224`    | quote  | `quote-plugin.ts:60`    |
| code      | `code-plugin.ts:483`    | hr     | `hr-plugin.ts:51`       |
| table     | `table-plugin.ts:621`   | html   | `html-plugin.ts:135`    |
| emoji     | `emoji-plugin.ts:72`    |        |                         |

So a single update performs 14 full-document tree walks, builds decorations for the whole
document rather than the viewport, sorts that entire array (`view-plugin.ts:65`), and
rebuilds the whole `RangeSet`.

Worse, `view-plugin.ts:113` triggers this on `update.selectionSet` as well as
`docChanged`. **Moving the cursor one character costs the same as editing.** That is the
single largest performance problem in the library: cost is O(document), not O(viewport),
on an interaction that happens continuously.

Some plugins do substantial per-node work on top of the walk. `code-plugin.ts`'s
`decorateFencedCode` slices every line of every fenced block, runs diff analysis and
regex highlighting, and does it for every code block in the document on every keystroke.

## Proposed approach

Fix it once in the core rather than 14 times in the plugins — the current shape invites
every future plugin to repeat the mistake.

1. **Add `visibleRanges` to `DecorationContext`** (`editor/plugin.ts:29`). Plugins get it
   without importing anything, and the type change makes the requirement discoverable.
2. **Iterate per visible range** in each plugin:
   ```ts
   for (const { from, to } of ctx.visibleRanges) {
     tree.iterate({ from, to, enter: ... });
   }
   ```
3. **Handle nodes that straddle the viewport edge.** Lezer's `iterate` with bounds yields
   nodes that *overlap* the range, so a fenced code block half off-screen is still
   entered — good. But a plugin that walks upward or derives line ranges from a node
   (quote, code, table) can still produce decorations outside the viewport. Building a
   decoration outside the rendered range is not an error in CodeMirror, but the work is
   wasted; clamp where cheap.
4. **Watch out for `Decoration.replace` across a viewport boundary.** CodeMirror requires
   replaced ranges to be inside the rendered content or it will throw when the viewport
   moves. This is the main correctness risk in the change and needs deliberate testing
   with long documents and fast scrolling.
5. **Reconsider the selection trigger.** Rebuilding everything on any selection change is
   only needed because retraction depends on the selection. Once the walk is
   viewport-scoped this is far cheaper, but a further optimisation is to rebuild only when
   the selection actually moves into or out of a decorated range.
6. **Measure.** Add a temporary timing harness in the playground devbar and record
   before/after for a large document. Without T-001 this is the only evidence available,
   and a perf claim without a number is not a claim.

## Affected areas

- `editor/view-plugin.ts` — `buildDecorations`, `DecorationContext` construction
- `editor/plugin.ts` — `DecorationContext` gains `visibleRanges`
- all 14 files in `plugins/` — the iterate call in each
- `artifacts/architecture/editor-core.md` — decoration lifecycle section
- `artifacts/architecture/plugin-system.md` — plugin authoring checklist gains "scope your
  walk to `ctx.visibleRanges`"
- `AGENTS.md` — the "Add a plugin" checklist
- `artifacts/memory.md` — new durable fact

## Acceptance

- [ ] No plugin iterates the syntax tree unbounded
- [ ] Typing in a 5,000-line document is measurably faster; number recorded in Notes
- [ ] Cursor movement no longer costs a full-document pass
- [ ] Fast scrolling through a long document with code blocks, tables, math and images
      throws nothing and leaves no missing decorations
- [ ] Constructs straddling the viewport edge render correctly
- [ ] All 8 playground checklist steps pass, both themes

## Notes

- Do this **before** T-012 (widget `eq`). Right now `eq` barely matters because everything
  is rebuilt anyway; once the walk is scoped, widget reuse becomes the next bottleneck and
  T-012's win becomes visible.
- The table plugin is the risky one — `computeBlockWrappers` and `computeAtomicRanges`
  (`table-plugin.ts:766-767`) are separate full-document passes fed to CodeMirror facets,
  not part of `buildDecorations`. Those may have to stay document-wide for correctness;
  read `artifacts/architecture/plugin-table.md` before touching them, per the standing rule.
- Landing this as 14 small commits (one per plugin) after the core change is more
  reviewable than one sweep, and keeps bisect useful if a plugin regresses.
