# Agent Memory

> Cross-session memory for agents working on Draftly.
> Append newest sessions at the top of the log. Keep entries short and durable — record
> things a future agent could not cheaply re-derive from the code or git history.

---

## How to use this file

**Write an entry when:**

- you learned something non-obvious about the codebase (a constraint, a gotcha, a "why")
- the developer stated a preference, corrected you, or made a decision
- you hit a dead end worth not repeating
- you shipped a change that alters how future work should be approached

**Do not write:**

- what the code already says (structure, APIs — those go in `architecture/`)
- what git history already says (what changed, when)
- transient session chatter or task status (that goes in `tasks/`)

**Format:** newest session first. One `##` heading per session. Keep the durable facts in
the "Learned" and "Decisions" subsections — those are what future agents actually read.

---

## Durable facts (read this before anything else)

Distilled from all sessions. Highest-value context, kept short deliberately.

### About the project

- **The document is always plain markdown text.** There is no secondary document model.
  Every feature must recompute what it needs from the Lezer syntax tree.
- **A plugin owns a markdown feature end to end** — parser, decorations, keymap, theme,
  and static HTML. Editor/preview parity is structural, not aspirational.
- **`editor/` never imports `plugins/`.** Plugins are always injected by the caller.
  Preserving this is what keeps the library tree-shakeable.
- The `apps/web` playground imports `draftly/src` (raw TypeScript), so library edits
  hot-reload. It is the only verification surface — **there is no test suite.**
- **Lint and format are Biome, not ESLint/Prettier** (migrated 2026-08-18). One binary for
  both. Shared presets in `packages/biome-config`; per-workspace `biome.json` extends
  `base` **plus** its framework layer — `base` is not implied by the others.

### Traps that have cost time

- **`requiredNodes` is the preview dispatch key.** A plugin with `renderToHTML()` but an
  empty `requiredNodes` is silently dead in preview. First thing to check when something
  renders in the editor but not the preview.
- **`buildDecorations` errors are swallowed** (`view-plugin.ts:57`). Intentional — Lezer
  hands out partial trees mid-parse — but genuine plugin bugs vanish. Temporarily replace
  the `catch` with a `console.error` when debugging a missing decoration.
- **`Decoration.replace` must never span a newline.** Clamp to `line.to`; CodeMirror
  throws otherwise. Canonical clamp: `heading-plugin.ts:104`.
- **`ThemeEnum.AUTO` does not detect the system theme.** It applies the `default` layer
  only. The name over-promises.
- **`sanitize: true` guarantees nothing, on any surface.** `ctx.sanitize()` is opt-in per
  plugin, not a pass over the finished document. On top of that, `preview/renderer.ts:125`
  returns leaf-node text **unescaped**, and `HTMLPlugin` has no `requiredNodes`, so HTML
  nodes reach exactly that path. DOMPurify is also the wrong tool for the attribute values
  several plugins feed it. Server-side it no-ops entirely. See T-003, T-009, T-010.
- **No plugin scopes its tree walk to the viewport.** `view.visibleRanges` is referenced
  nowhere in the library, despite `buildDecorations`' own JSDoc claiming otherwise. Every
  update — including a plain cursor move — costs 14 full-document tree walks plus a second
  one for `buildNodes`. This is the library's dominant performance cost. See T-011, T-013.
- **`WidgetType.eq()` must compare content, never document positions.** Six widgets compare
  `from`/`to`, which shift on any edit above them, so the widget is never reused — KaTeX
  and Mermaid re-render on every keystroke. `TaskCheckboxWidget` shows the correct pattern:
  content-only `eq`, position resolved at event time via `view.posAtDOM()`. See T-012.
- **There is no teardown path anywhere.** `grep -rn "destroy" packages/draftly/src` returns
  nothing — no view-plugin `destroy()`, no widget `destroy()`, no `onViewDestroy`, and
  `onUnregister` is declared but never called. The table plugin's pending-view fields
  therefore retain destroyed editors indefinitely. See T-016.
- **Plugin instances are module-level singletons with mutable per-view state.**
  `allPlugins` is `[...essentialPlugins]` — the same objects. Two editors on one page
  overwrite each other's `_context` and cancel each other's table normalization. See T-017.
- **`wrapperClass` must match between `preview()` and `generateCSS()`** or preview output
  is completely unstyled. Most common integration mistake.
- **Never dispatch a transaction from `buildDecorations` or `update()`.** Use the
  `schedule*` deferred pattern from `table-plugin.ts`, and annotate self-dispatches so
  they can be recognised on re-entry.
- **Bump `VERSION` in `apps/web/app/playground/page.tsx`** after editing seed markdown in
  `app/data/md/`, or returning users keep the cached old copy.
- **Bun only.** `pnpm-workspace.yaml` exists for tooling compatibility but running
  `pnpm install` or `npm install` creates a conflicting lockfile.
- **CodeMirror packages must stay external/peer.** Two copies of `@codemirror/state` in
  one bundle breaks facet identity and fails in confusing ways.
- **`preview/syntax-theme.ts` depends on undocumented CodeMirror internals.** A
  `@codemirror/language` upgrade can silently drop preview syntax colours with no type
  error. Re-test preview code blocks after any CodeMirror bump.

### Biome facts worth not re-deriving

- Biome 2.x allows **exactly one** config with `"root": true` in a repo. Every workspace
  config must set `"root": false` or Biome errors out.
- `"rules": { "recommended": true }` is **deprecated** in 2.5.x — the current spelling is
  `"preset": "recommended"`. `bunx biome migrate --write` converts it.
- Ignore patterns must **not** carry a trailing `/**` (`"!**/dist"`, not `"!**/dist/**"`).
  The old form is flagged by `suspicious/useBiomeIgnoreFolder`.
- `css.parser.tailwindDirectives: true` is required or `packages/ui/src/styles/globals.css`
  fails to parse on `@source`. Likewise `json.parser.allowComments` +
  `allowTrailingCommas` for the `tsconfig`-style files in `packages/typescript-config`.
- **`organizeImports` is deliberately off.** Import order in `packages/draftly` is
  load-bearing in places (CodeMirror extension/facet precedence). Do not turn it on.
- A `// biome-ignore` comment must sit directly above the line the diagnostic *anchors* to.
  For `useExhaustiveDependencies` that is the `useMemo`/`useEffect` call, **not** the
  dependency array — putting it above the array yields `suppressions/unused`.
- The old ESLint setup used `eslint-plugin-only-warn`, so `bun run lint` could never fail.
  Biome errors do block. Newly-gained a11y coverage and ~60 pre-existing stylistic findings
  are pinned to `warn` in `base.json` so the migration landed green; they are a burn-down
  backlog, not permanent policy.

### Developer's stated preferences

Captured 2026-08-18 at project setup. See [Session 2026-08-18](#session-2026-08-18--artifact-system-bootstrap).

1. Clean, readable code; clean architecture, strictly.
2. **Strict JSDoc format** for comments — not loose `//` prose.
3. Modular above all — small units, clear boundaries.
4. Read relevant skills and artifacts **before** acting, not after.
5. Keep artifacts (memory, tasks, architecture) updated as work proceeds.
6. **Organised git history: commit only correlated edits, never everything at once.**
7. **If something looks suspicious or conflicting, ask before changing it.**

---

## Open questions for the developer

Unresolved. Do not act on these unilaterally — raise them when the topic comes up.

| #   | Question                                                                                                                                                            | Context                                                                                                                 | Raised     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | The public README documents a `themeStyle` config option that does not exist on `DraftlyConfig`. Was it removed, renamed, or never implemented?                     | `README.md` config table vs `editor/draftly.ts:29`. Consumers following the README will pass a silently ignored option. | 2026-08-18 |
| 2   | The README shows `preview()` used synchronously (`const html = preview(...)`), but it returns a `Promise<string>`. Fix the docs, or was a sync path intended?       | `README.md` preview example vs `preview/preview.ts:24`. Following the README renders `[object Promise]`.                | 2026-08-18 |
| 3   | `DraftlyPlugin.dependencies` is declared but nothing reads it — no topological sort, no validation. Finish it or remove it?                                         | `editor/plugin.ts:61`                                                                                                   | 2026-08-18 |
| 4   | `turbo.json` declares a `check-types` task but the packages define `typecheck`. Nothing connects them, so `turbo run check-types` matches nothing. Which name wins? | `turbo.json` vs `packages/*/package.json`                                                                               | 2026-08-18 |
| 5   | Should a test runner be introduced, and if so `bun test` or Vitest? The pure layers (`editor/utils.ts`, table text utilities) are trivially testable.               | No test infrastructure exists anywhere in the repo.                                                                     | 2026-08-18 |
| 6   | Split `table-plugin.ts` (1759 LOC) and `code-plugin.ts` (1368 LOC) into directories? Both are far past the ~500 LOC ceiling other plugins respect.                  | The table plugin was reworked very recently (`e5dc598`); a large move would obscure that history.                       | 2026-08-18 |
| 7   | 91 Biome warnings are outstanding after the ESLint→Biome migration — mostly `noNonNullAssertion` (34) in the plugins and newly-gained a11y findings in `packages/ui`'s vendored shadcn components. Burn them down, or pin the rules off permanently? | `packages/biome-config/base.json` severity table; see `artifacts/architecture/build-and-tooling.md`. | 2026-08-18 |
| 8   | `PreviewRenderer`'s `theme` and `sanitizeHtml` private fields are assigned in the constructor but never read (`noUnusedPrivateClassMembers`). Dead state, or a wiring bug in the preview pipeline? | `preview/renderer.ts:18,21`. Left in place rather than deleted, per the "ask, don't resolve unilaterally" rule. | 2026-08-18 |
| 9   | `essentialPlugins` / `allPlugins` export shared mutable instances, so two editors on one page cross-talk. Fix by exporting factories (breaking) or by moving view-scoped state into a `WeakMap`/`StateField` (non-breaking, larger refactor)? | `plugins/index.ts:38`; T-017 | 2026-08-18 |
| 10  | `ThemeEnum.AUTO` is the default and applies neither theme layer. Implement real system detection (behaviour change for every consumer) or rename it to something honest like `DEFAULT`? | `editor/utils.ts:68`; T-026 | 2026-08-18 |
| 11  | With `sanitize: false`, should `HTMLPlugin` emit raw HTML (honouring the flag literally) or escape it? The flag's name says the former; safety says the latter. | `plugins/html-plugin.ts`; T-010 | 2026-08-18 |
| 12  | `onNodesChange` is public API and eagerly builds a full node tree on every update. Change the signature to a lazy getter (breaking), add a parallel option, or accept the cost? | `editor/view-plugin.ts:124`; T-013 | 2026-08-18 |
| 13  | `draftlyThemeFacet` is defined and populated but never read — the theme is baked in at extension-construction time instead. Wire the facet up (enables runtime theme switching) or delete it? | `editor/view-plugin.ts:29,185`; T-024 | 2026-08-18 |

---

## Session log

### Session 2026-08-18 — full-codebase audit

**Goal:** Analyse the whole codebase for hidden bugs, memory leaks, and performance, UX and
code-quality problems, then record the findings as tasks.

**Done:**

- Audited the library end to end (`editor/`, `preview/`, all 14 plugins, `lib/`), the
  playground, and the build/packaging config.
- Created `T-009`–`T-026` (18 tasks) and reorganised `tasks/index.md` by theme, since
  sequencing within each group matters more than ID order.
- Narrowed the scope of `T-003` — its original framing of the sanitization gap as
  server-specific was wrong.
- **Changed no source code.** Several findings are public-API or behaviour changes; per
  working rule 1 they are logged as questions 9–13 above rather than resolved.

**Learned** — the high-value items are promoted to _Traps that have cost time_ above. The
findings that reframed how the codebase reads:

- The performance story is not about individual plugins being slow; it is that the core
  never established a viewport contract, so all 14 plugins independently do the maximum
  possible work. Fixing it in `DecorationContext` fixes it everywhere and stops the next
  plugin repeating it.
- The sanitization gap is structural, not a server-side caveat. The renderer's *fallback*
  path — not any plugin — is what emits raw HTML, which is why no amount of plugin-level
  care would have caught it.
- The `requiredNodes` trap already recorded in this file has a live instance: `HTMLPlugin`
  is silently absent from preview, on the one node type where absence is dangerous.
- Several "look like accidents but are not" mechanisms genuinely are accidents when read
  against the whole system — positions in `eq()`, per-call theme `StyleModule`s, and the
  singleton plugin collections all work only because a single editor is the only tested
  configuration.

**Decisions:**

- Grouped the index by theme with an explicit suggested order, rather than appending 18
  rows to a flat table.
- Kept `T-009` and `T-010` separate despite the shared symptom — different mechanisms,
  different files, two commits.
- Recorded measurement as an acceptance criterion on every performance task. With no test
  suite, an unmeasured perf claim is not a claim.

**Left open:** everything. All 18 are `Proposed`; questions 9–13 need the developer.

### Session 2026-08-18 — artifact system bootstrap

**Goal:** Analyse the codebase end to end, then create the `artifacts/` knowledge base
and the `AGENTS.md` instruction set (`CLAUDE.md` is a symlink to it).

**Done:**

- Read the full library source (`packages/draftly/src`, ~8.9k LOC across 33 files), the
  monorepo tooling, the playground app, and the git history.
- Created `artifacts/`: `memory.md`, `repository-map.md`, `architecture/` (8 documents),
  `tasks/` (index + completed + ongoing).
- Wrote `AGENTS.md` as the agent instruction set.

**Learned** — all promoted to _Durable facts_ above. The highest-leverage discoveries:

- The two-surface plugin design is the architectural core; the `requiredNodes` map in
  `PreviewRenderer` is the mechanism that binds the surfaces, and the silent-failure mode
  when it is empty is the system's sharpest edge.
- `renderer.ts` deliberately parses via `@codemirror/lang-markdown` rather than raw
  `@lezer/markdown` (changed in `dab22ab`) specifically so the preview tree matches the
  editor tree. The option object is duplicated in `draftly.ts` and must be kept in sync.
- The `disableViewPlugin` gate wraps the _entire_ plugin loop. A prior bug (`ed6ea7e`)
  leaked plugin extensions into raw mode — the loop must stay inside the `if`.
- `table-plugin.ts`'s `pending*View` fields are re-entrancy locks, not caches. Removing
  them causes infinite dispatch loops.

**Decisions:**

- Architecture split into 8 focused documents rather than one large file, so a task can
  load only what it needs.
- `table-plugin.ts` got its own deep-dive document, given its size, recent churn, and the
  number of mechanisms in it that look accidental but are not.
- Recorded the README drift (open questions 1 and 2) rather than fixing it — per the
  developer's instruction to ask about conflicts first.

**Left open:** all six open questions above.

---

<!--
Template for new entries:

### Session YYYY-MM-DD — <short title>

**Goal:**

**Done:**

**Learned:** (promote anything durable to the "Durable facts" section above)

**Decisions:**

**Left open:**
-->
