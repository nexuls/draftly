# AGENTS.md

Instruction set for AI agents working on **Draftly**.
`CLAUDE.md` is a symlink to this file — edit this one.

---

## What Draftly is

A pluggable markdown editor and static previewer built on CodeMirror 6, published to npm
as `draftly`. The repo is a Turborepo monorepo managed with Bun.

Two ideas carry the whole design:

1. **The document is always plain markdown text.** There is no secondary document model.
   Richness is CodeMirror _decorations_ layered on top, which retract when the cursor
   enters a construct to reveal the raw syntax.
2. **A plugin owns a markdown feature end to end** — its parser extension, editor
   decorations, keymap, theme, _and_ its static HTML renderer. One class, one feature,
   both surfaces. This is what makes editor/preview parity structural rather than
   aspirational.

Read [`artifacts/architecture/overview.md`](artifacts/architecture/overview.md) before
your first substantive change.

---

## Start every session here

**Before touching any code, in this order:**

1. **[`artifacts/memory.md`](artifacts/memory.md)** — durable facts, traps that have cost
   time, the developer's preferences, and open questions. Non-negotiable; it exists
   precisely because the codebase's sharpest edges are invisible from a quick read.
2. **[`artifacts/tasks/index.md`](artifacts/tasks/index.md)** — what is in flight, what is
   blocked, what has shipped.
3. **[`artifacts/architecture/index.md`](artifacts/architecture/index.md)** — pick the
   documents relevant to your task from the "open it when" column. Do not read all of
   them by default.
4. **[`artifacts/repository-map.md`](artifacts/repository-map.md)** — if you need to
   locate something.

**Then load the relevant skill:**

| Working on                                                      | Read first                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Decorations, view plugins, facets, extensions, keymaps, widgets | `.agents/skills/codemirror/` — including `references/architecture.md` and `references/extensions.md` |
| `turbo.json`, workspaces, caching, CI, filtering                | `.agents/skills/turborepo/` — including the topic file under `references/`                           |

Both skills have `references/` subdirectories with far more depth than their `SKILL.md`.
Read the specific topic file, not just the summary.

**Non-negotiable, additionally:**

- Read `artifacts/architecture/plugin-table.md` **before any edit** to
  `plugins/table-plugin.ts`. Several of its mechanisms look like accidents and are not.

---

## Working rules

### 1. Ask when something is suspicious or conflicting

If the code contradicts an architecture document, a README claim, or a comment — **stop
and ask the developer.** Do not silently pick one and "fix" the other. The document may
be describing intent the code has drifted from, and that gap is information.

Six such conflicts are already logged in
[`artifacts/memory.md`](artifacts/memory.md#open-questions-for-the-developer). Add to that
table rather than resolving unilaterally.

### 2. Clean architecture, strictly

- **One feature, one plugin file.** Cross-plugin coupling is the thing this architecture
  exists to prevent.
- **`editor/` never imports `plugins/`.** Plugins are injected by the caller. Preserving
  this keeps the library tree-shakeable.
- **Keep pure logic pure.** Text utilities, parsing, and formatting must not acquire a
  CodeMirror dependency. This is why the table plugin's lowest layers are testable.
- **Layer boundaries are real.** Identify the layer you are editing and stay inside it.
- **~500 LOC is the plugin ceiling.** Split into a directory before exceeding it. Two
  files already exceed it and are tracked as debt, not precedent.

### 3. Modular by default

Prefer a new small module over growing an existing file. Prefer a pure function over a
method that reaches into state. Prefer injecting a dependency over importing a singleton.

### 4. JSDoc, strictly

Every exported symbol — class, function, type, interface, constant — carries JSDoc.
Follow the existing style in `editor/plugin.ts` and `editor/draftly.ts`.

```ts
/**
 * Build heading decorations by iterating the syntax tree.
 *
 * @param ctx - Decoration context with view and decoration array
 * @returns Nothing; decorations are pushed into `ctx.decorations`
 */
```

- Document **why**, not what the code already says.
- `@param` for every parameter, `@returns` where non-void, `@example` on public API.
- Non-obvious constants get a JSDoc line explaining the choice — especially
  `decorationPriority` values.
- Match the surrounding file's comment density. Do not add narration to code that reads
  clearly on its own.

### 5. Git history stays organised

**Commit only correlated edits. Never everything at once.**

- One logical change per commit. A refactor and a bug fix are two commits, even in the
  same file.
- Code and its artifact updates belong in the **same** commit — a doc that lands a commit
  later is a doc that will be forgotten.
- Format: `type(scope): Description` — matching the existing history.
  - Types: `feat`, `fix`, `refactor`, `docs`, `chore`
  - Scopes: `draftly`, `web`, `ui`, or omit for repo-wide
  - Examples: `feat(draftly): Emoji Plugin`, `fix(draftly): Ignore tailing non-table line`
- Do commit as you go. Do not stage a large change and commit it all at once.
- Do Not branch off master unless told; do not push unless asked.
- Add a changeset (`bun changeset`) for any user-facing library change.

### 6. Keep artifacts current

| After you…                                    | Update                                     |
| --------------------------------------------- | ------------------------------------------ |
| Learn something non-obvious, or get corrected | `artifacts/memory.md`                      |
| Start, advance, or finish work                | `artifacts/tasks/` + its index             |
| Change structure, contracts, or mechanisms    | the relevant `artifacts/architecture/*.md` |
| Add or move a directory                       | `artifacts/repository-map.md`              |

Update the front-matter `Last verified` line and commit hash when you revise a document.

Write to memory what a future agent **could not cheaply re-derive**: constraints, "why"
decisions, dead ends, developer preferences. Do not write what the code or git history
already says.

### 7. Verify before claiming done

There is **no test suite** (tracked as T-001). Verification is manual:

```bash
bun dev                                      # playground with hot-reloaded library
cd packages/draftly && bun run typecheck     # tsc --noEmit
bun run lint                                 # biome check — read-only, fails on errors
bun run check:fix                            # biome check --write — lint fixes + format
```

Lint and format are **Biome**, not ESLint/Prettier. `lineWidth` is 120. Shared presets live
in `packages/biome-config`; each workspace's `biome.json` extends `base` plus its framework
layer. Suppress with `// biome-ignore lint/<group>/<rule>: <reason>` — the reason is
mandatory, and the comment goes above the line the diagnostic anchors to.

For a library change, work through the 8-step playground checklist in
[`artifacts/architecture/web-playground.md`](artifacts/architecture/web-playground.md).
The short version: check the **editor pane**, the **preview pane**, the **HTML pane**, and
the **CSS pane**; toggle your plugin off; toggle dark/light.

Report honestly. If you could not verify something, say so.

---

## Traps that have already cost time

The full list is in [`artifacts/memory.md`](artifacts/memory.md). The ones that bite most:

- **`requiredNodes` is the preview dispatch key.** A plugin with `renderToHTML()` but an
  empty `requiredNodes` is silently dead in preview. First thing to check when something
  renders in the editor but not the preview.
- **`buildDecorations` errors are swallowed** (`editor/view-plugin.ts:57`). Intentional —
  Lezer exposes partial trees mid-parse — but genuine bugs vanish identically. Temporarily
  swap the `catch` for a `console.error` when a decoration does not appear.
- **`Decoration.replace` must never span a newline.** Clamp to `line.to`. Canonical
  example: `heading-plugin.ts:104`.
- **Never dispatch a transaction from `buildDecorations` or `update()`.** Use the
  `schedule*` deferred pattern from `table-plugin.ts`, and annotate self-dispatches.
- **`ThemeEnum.AUTO` does not detect the system theme.** It applies the `default` layer only.
- **`sanitize()` is a no-op on the server.** DOMPurify needs a DOM; `sanitize: true` gives
  no SSR protection.
- **`ctx.sanitize()` does nothing useful for an attribute value.** It parses an HTML
  *fragment*; a bare string is not one, so it comes back unchanged — quotes included.
  Escape attributes with `escapeHtml`; sanitize only real fragments.
- **`wrapperClass` must match** between `preview()` and `generateCSS()`, or output is unstyled.
- **Bun only.** `pnpm install` or `npm install` creates a conflicting lockfile.
- **CodeMirror packages stay external/peer.** Two copies of `@codemirror/state` breaks
  facet identity.
- **Bump `VERSION`** in `apps/web/app/playground/page.tsx` after editing seed markdown in
  `app/data/md/`, or returning users keep the cached copy.

---

## Common tasks

### Add a plugin

1. Read [`artifacts/architecture/plugin-system.md`](artifacts/architecture/plugin-system.md).
2. Create `packages/draftly/src/plugins/<feature>-plugin.ts`.
3. Extend `DecorationPlugin` (or `DraftlyPlugin` if render-only). Set `name`, `version`,
   `decorationPriority` (pick within an existing band), and `requiredNodes`.
4. Hoist `Decoration` instances to module scope — allocating per keystroke is a real cost.
5. In `renderToHTML`, read class names off the decoration specs
   (`someDecoration.spec.class`) rather than retyping them. This is the mechanism that
   enforces parity.
6. Guard every hiding decoration with `ctx.selectionOverlapsRange(from, to)`.
7. **Escape attribute values, sanitize fragments, and run URLs through `safeUrl()`.**
   `ctx.sanitize()` is for a blob of HTML that stays markup; anything going into a quoted
   attribute or rendered as text gets `escapeHtml` from `draftly/lib`. Apply `safeUrl()`
   on both surfaces, not just preview.
8. Put the theme at the bottom of the file via `createTheme()`.
9. Register in `plugins/index.ts` — named export **and** `essentialPlugins`.
10. Add a row to `artifacts/architecture/plugins-catalog.md`.
11. Extend `apps/web/app/data/md/walkthrough.ts` and bump `VERSION`.
12. Verify both surfaces in the playground.

### Change the editor core

Only for **feature-agnostic** changes — the test is whether two unrelated plugins would
both want it. Read
[`artifacts/architecture/editor-core.md`](artifacts/architecture/editor-core.md) first.
Anything markdown-feature-specific is a plugin, not core.

### Change static output

Usually a plugin's `renderToHTML()`. Read
[`artifacts/architecture/preview-pipeline.md`](artifacts/architecture/preview-pipeline.md)
before touching `preview/`, especially `syntax-theme.ts`, which depends on undocumented
CodeMirror internals.

---

## Boundaries

- **Do** commit as you go. Do not stage a large change and commit it all at once.
- **Do not** push, publish, or release unless asked.
- **Do not** change the public API surface without flagging it — `draftly` is published
  and consumers depend on it.
- **Do not** add a runtime dependency to `packages/draftly` without asking; bundle size is
  a design constraint (it is why `allPlugins` is opt-in).
- **Do not** move CodeMirror packages out of peer/external.
- **Do not** put library features in `apps/web`. The playground is a consumer, exactly
  like an external user's app. Shared helpers belong in `packages/draftly/src/lib/`.
- **Do not** resolve a conflict between docs and code on your own — ask.
