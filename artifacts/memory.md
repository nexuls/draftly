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
  renders in the editor but not the preview. Since C-012 this **warns in development**
  (`preview/renderer.ts`, `buildNodePluginMap`) — the trap is still real, it is just no
  longer silent.
- **`buildDecorations` errors are swallowed *while the tree is still parsing*.** Since
  C-020 they are reported otherwise — deduplicated per plugin and message, via
  `DraftlyConfig.onPluginError` or a dev-only `console.error`. The discriminator is
  `syntaxTreeAvailable(state, view.viewport.to)`, **not** matching Lezer's error messages;
  message text is not stable across versions. If a decoration is missing and nothing was
  logged, the failure is not an exception — look at the logic.
- **`Decoration.replace` must never span a newline.** Clamp to `line.to`; CodeMirror
  throws otherwise. Canonical clamp: `heading-plugin.ts:104`.
- **`ThemeEnum.AUTO` does not detect the system theme.** It applies the `default` layer
  only. The name over-promises.
- **`sanitize: true` still guarantees nothing *on the server* unless `sanitizer` is
  passed.** C-011 and C-012 fixed the client side; C-013 added `PreviewConfig.sanitizer`
  and a one-per-process `console.warn`, but the no-sanitizer fallback still passes HTML
  through. `ctx.sanitize()` also remains opt-in per plugin rather than a pass over the
  finished document.
- **Escaping and sanitizing are different operations.** `ctx.sanitize()` parses an HTML
  *fragment*; handed a bare string — a URL, a title, an alt text — it returns it unchanged,
  quotes included. Attribute values and text get `escapeHtml` (`lib/escape-html.ts`); only
  a real fragment gets `sanitize()`. URLs additionally get `safeUrl()` (`lib/safe-url.ts`),
  on **both** surfaces. This cost a live attribute-injection bug (C-011).
- **DOMPurify balances the fragment it is given**, so it cannot sanitize a lone tag:
  `<b>` comes back `<b></b>` and `</b>` comes back `""`. The markdown parser emits one
  `HTMLTag` node per tag, so `HTMLPlugin.renderToHTML` sanitizes inside a balanced probe
  and reads the verdict off the result rather than using the output directly (C-012).
- **Walk the tree with `ctx.iterateVisible`, never `syntaxTree(view.state).iterate`.**
  Fixed in C-016; before it, all 14 plugins walked the whole document on every update,
  including a plain cursor move (decorations rebuild on `selectionSet` too). 39.2 ms →
  0.40 ms per build on a 5,000-line document. Two deliberate exceptions remain, both in
  `TablePlugin`: `computeBlockWrappers` and `computeAtomicRanges` feed **facets**, not the
  decoration set, and a wrapper or atomic range that vanished on scroll would break table
  layout and cursor motion. `buildNodes` is also still document-wide — that is T-013.
- **A paired inline HTML tag split by the viewport edge loses its preview widget** and
  renders as an orphan-tag mark instead. Known and accepted (C-016); cosmetic, and it
  self-corrects on the next viewport update.
- **`WidgetType.eq()` must compare content, never document positions.** Positions shift on
  any edit above them, so a position-comparing `eq` never reports equality and the widget
  is rebuilt every keystroke. Fixed for all six offenders in C-017. Handlers that need a
  range call `resolveWidgetRange(view, dom, [nodeName])` from `draftly/lib`, which resolves
  it from the live DOM — it tries **both** sides of `posAtDOM`, because Draftly places
  widgets as both a `replace` over the construct (position = start) and a `widget` with
  `side: 1` at its end (position = end).
- **Release view-scoped state in `onViewDestroy`.** Added in C-018, called from the view
  plugin's `destroy()`. A plugin instance outlives the view that used it — per-editor
  instances (C-026) changed who shares state, not how long it lives. `EditorView` has **no
  public "destroyed" flag** — a queued microtask cannot ask the view whether it is still
  alive, so `TablePlugin` keeps a `WeakSet` of torn-down views and checks it before
  dispatching.
- **`onUnregister` is deprecated and still never called.** C-026 removed half its
  rationale — with per-editor instances, clearing `_context` no longer breaks other
  editors — but plugin registration is still not scoped to a view, so there is no event to
  fire it on. Do not "fix" it by calling it from view destruction.
- **Build plugins with `createEssentialPlugins()` / `createAllPlugins()`, one set per
  editor** (C-026). The `essentialPlugins` / `allPlugins` arrays are the old shared
  singletons, kept `@deprecated` and **behaviourally unchanged** for one cycle — a consumer
  who only recompiles keeps the bug, which is the point of the deprecation. Removing them
  is a major and is still open.
- **A plugin must not hold view-scoped state.** Anything derived from a specific
  `EditorView` keys off the view (`WeakMap`/`StateField`) or is released in
  `onViewDestroy`. `_config`/`_context` are the sanctioned exception, written once at
  composition time. Per-editor instances fix *sharing*, not *retention* — a plugin holding
  a destroyed view still pins it.
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
- **No plugin may contain a literal colour.** Everything resolves through a `--draftly-*`
  token declared in `editor/theme.ts`, with a host variable read first
  (`var(--color-primary, #0366d6)`). A `dark` layer inside a plugin means a token is
  missing. See [`architecture/theming.md`](./architecture/theming.md#design-tokens).
- **A dark override written at lower specificity than its default silently never applies.**
  Four of `code-plugin.theme.ts`'s dark rules were dead this way for who knows how long,
  and nothing surfaces it — the CSS is valid, it just loses. This is the strongest argument
  for the token layer: the value flips in one place instead of being re-declared.
- **`renderToHTML` must never emit a class the editor uses for *line* layout.** `ListPlugin`
  tagged preview `<ul>`s with `cm-draftly-list-line-ul`, so they inherited `display: flex`
  and a `padding-left` computed from a `--depth` property that only exists per editor line.
  Preview classes are separate on purpose.
- **`scripts/theme-snapshot.ts` proves a style refactor is inert.** It dumps the resolved
  preview CSS per theme with `var()` references inlined and fallbacks collapsed, so a
  before/after diff shows real rendered differences rather than token indirection. Use it
  for anything touching themes — there is still no test suite.
- **No bundler-specific import syntax may appear in `src/`.** `packages/draftly` is
  consumed through *two* entry points with different resolvers: `dist/` (bundled by
  whatever the consumer uses) and `./src` (raw TypeScript, which is how `apps/web`
  imports it). A specifier that only one of them understands breaks the other silently.
  KaTeX's stylesheet was imported with Vite's `?raw` suffix; tsup's `.css: "text"` loader
  never applied to it, so `dist/` shipped an unresolvable import and `MathPlugin` could not
  be bundled at all (C-025). The fix is a *generated* `.ts` module — `bun run
  generate:katex-css` — because a plain string constant is the only form both resolvers
  agree on. `**/*.generated.ts` is excluded from Biome in `biome-config/base.json`.
- **Measure before caching — C-016 and C-017 already removed most of the redundancy.**
  T-015 proposed memoizing `emoji.emojify`, `renderMath` and `renderMermaid`. Measured:
  `emojify` is 0.36 µs, so 100 *visible* shortcodes add 0.036 ms to a 0.40 ms decoration
  build; and `renderMath` runs from `toDOM`, which since C-017 fires on scroll re-entry
  rather than per keystroke. Both caches were dropped. The general lesson is that
  per-keystroke cost estimates written before C-016/C-017 are inflated by exactly those two
  bugs — re-derive them rather than trusting the task file.
- **KaTeX's `@font-face` URLs are relative and have never resolved.** The inlined stylesheet
  references `fonts/KaTeX_*`, which resolve against the *page* URL once injected into
  `<head>`, not against the package. Consumers get KaTeX's layout with fallback glyphs
  unless they serve those files themselves. Pre-existing, orthogonal to C-025, open
  question 17.
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
| 9   | ~~`essentialPlugins` / `allPlugins` export shared mutable instances.~~ **Answered 2026-08-18: option A, factories.** Shipped in C-026 as a *minor* — factories added, arrays deprecated but behaviourally unchanged. Removing the arrays is a separate major and still needs a call. | `plugins/index.ts`; C-026 | 2026-08-18 |
| 10  | `ThemeEnum.AUTO` is the default and applies neither theme layer. Implement real system detection (behaviour change for every consumer) or rename it to something honest like `DEFAULT`? | `editor/utils.ts:68`; T-026 | 2026-08-18 |
| 11  | ~~With `sanitize: false`, should `HTMLPlugin` emit raw HTML or escape it?~~ **Answered provisionally in C-012: honour the flag literally** — raw HTML with `sanitize: false`, sanitized with the default `true`. Confirm or overturn. | `plugins/html-plugin.ts`; C-012 | 2026-08-18 |
| 12  | `onNodesChange` is public API and eagerly builds a full node tree on every update. Change the signature to a lazy getter (breaking), add a parallel option, or accept the cost? | `editor/view-plugin.ts:124`; T-013 | 2026-08-18 |
| 14  | With `sanitize: true` and no DOM and no `sanitizer`, preview passes HTML through (now with a warning). Should it instead **escape** the HTML, so the default is safe everywhere? That is a behaviour change for existing SSR consumers, whose HTML blocks would start rendering as visible source. | `preview/context.ts`; C-013 | 2026-08-18 |
| 15  | `codemirror-lang-latex` is **AGPL-3.0-or-later** and `draftly` is MIT. Taking it as a dependency — even lazily imported — would push copyleft terms onto every consumer, so `MathPlugin` accepts an injected parser instead. Confirm that injection is the intended long-term shape, or is a differently-licensed LaTeX parser worth vendoring? | `plugins/math-plugin.ts`; the fork this came from is an app, where the licence question does not arise the same way. | 2026-08-18 |
| 16  | Plugin themes emit their editor-only rules into preview CSS and vice versa — e.g. `.cm-draftly-list-line-ul`'s flex layout is in the generated preview stylesheet, matching nothing. Split each plugin theme into editor/preview/shared halves, as `editor/theme.ts` now does? | `editor/plugin.ts` `getPreviewStyles`; noticed while fixing the list-class leak. | 2026-08-18 |
| 17  | KaTeX's bundled CSS references its fonts relatively (`url(fonts/KaTeX_AMS-Regular.woff2)`), so injecting it as a `<style>` element resolves them against the consumer's page URL and they 404. Ship the fonts, base64-inline them (~1 MB), or document that consumers must import `katex/dist/katex.min.css` themselves — which is option 1 of C-025 after all? | `plugins/math-plugin.ts`, `plugins/katex-css.generated.ts`; C-025 | 2026-08-18 |
| 13  | `draftlyThemeFacet` is defined and populated but never read — the theme is baked in at extension-construction time instead. Wire the facet up (enables runtime theme switching) or delete it? | `editor/view-plugin.ts:29,185`; T-024 | 2026-08-18 |

---

## Session log

### Session 2026-08-18 — migrating the logits fork

Implemented [`tasks/logits-migration-plan.md`](./tasks/logits-migration-plan.md). Nine
workstreams landed; the plan's own reject list held up on contact.

**What the comparison actually showed.** The fork's diff is 2,170 lines and most of it is
an 80-column reformat — its `biome.json` sets `lineWidth: 80`, this repo's sets 120. Every
identifier the big "AGENT standard" commit appeared to add already existed here; they only
showed as additions because their signatures wrapped. Checking that before planning saved
re-applying a 1,600-line no-op.

**Where the fork was solving the right problem the wrong way.** Three of its changes had to
be rebuilt rather than ported, and the reasons generalise:

- Its design-token layer mapped straight onto its app's shadcn variables, which would leave
  the published package unstyled anywhere else. Tokens here read the host variable *and*
  carry a literal fallback.
- Its preview base-style sharing hardcoded `.draftly-preview`, breaking any custom
  `wrapperClass`, and wrapped preview output in `div.cm-content` so the editor's selectors
  would match — leaking a CodeMirror-internal class into static HTML. Rewriting the
  selectors instead leaves `preview()` output alone.
- Its list-indentation fix moved a `--depth` expression into the preview rules. `--depth`
  is never set in preview, so it changed the constant and not the behaviour. The actual bug
  was that preview lists carried editor *line* classes at all.

**Verification, without a browser or a test suite.** `scripts/theme-snapshot.ts` was written
before touching any theme: it resolves every `var()` back to the literal it stands for, so
a before/after diff shows rendered differences rather than token indirection. Every plugin
conversion was checked against it, and every surviving difference was classified by hand —
which is how the four dead dark-mode rules in `code-plugin.theme.ts` were found. That
harness caught one real regression I introduced (a substitution pattern that silently
missed the mermaid error block while its dark layer was being deleted).

**A licensing finding that changed a decision.** The developer approved lazy-loading
`codemirror-lang-latex` on bundle-size grounds. It is AGPL-3.0-or-later; `draftly` is MIT.
Approving a size tradeoff is not approving a copyleft dependency for every consumer, so
`MathPlugin` takes an injected parser instead and the package list is unchanged. Logged as
open question 15.

**Not migrated:** the fork's formatting churn, its app-specific token values, and assorted
cosmetic tweaks (heading weights, content padding, dimmed paragraph text) that read as
choices for its own product rather than library defaults.

### Session 2026-08-18 — implementing the audit backlog

**Goal:** the developer asked to implement the ongoing tasks and commit accordingly.

**Done:** 16 tasks shipped as 16 commits, `C-009`-`C-024`. In the order they landed:
theme purity and `deepMerge` hardening; theme memoization; attribute escaping and URL
scheme guards; the preview leaf-fallback and `HTMLPlugin`; server-side sanitization;
preview dispatch priority; preview renderer redundancy; **viewport-scoped decorations**;
widget `eq()`; the teardown lifecycle; widget async guards; decoration error reporting;
grapheme-aware table widths; widget accessibility; the playground preview race; and
tree-shakeability.

**Left untouched, deliberately:** every task whose _Blocked on_ column names a developer
decision — `T-001`, `T-002`, `T-005`, `T-006`, `T-007`, `T-013`, `T-017`, `T-024`,
`T-026`. Also `T-015`, whose premise needs re-measuring now that C-016 and C-017 have
landed, and `T-020` step 4, which is a breaking export change.

**Learned** — the durable items are promoted above. Three worth naming here:

- **The two big performance findings were the same finding.** Viewport scoping (C-016,
  39.2 ms → 0.40 ms) and widget `eq()` (C-017) both came from nothing in the core
  establishing a contract, so 14 plugins independently did the maximum possible work.
  Both were fixed in the core — `ctx.iterateVisible`, `resolveWidgetRange` — rather than
  14 times over, which is also what stops the next plugin repeating them.
- **DOMPurify cannot sanitize a lone HTML tag.** It balances the fragment it is handed, so
  the parser's per-tag `HTMLTag` nodes cannot be passed through it directly. This
  invalidated the approach T-010 proposed and forced the balanced-probe design in C-012.
- **Verification without a browser has a hard ceiling.** Analytical substitutes worked
  better than expected — a sliding-window walk proved C-016 loses no decorations, and
  before/after widget comparison proved C-017 — but the playground checklist, the heap
  snapshot, and screen-reader testing are all still outstanding and are recorded as
  unchecked acceptance boxes rather than quietly claimed.

**Decisions:** two open questions were answered provisionally rather than left blocking,
both flagged for the developer — Q11 (`sanitize: false` honours the flag literally, C-012)
and the decorative-versus-control classification for widgets (C-022). New open question
14 was added, on whether server-side sanitization should escape rather than pass through.

**New tasks:** `T-027` (a `?raw` CSS import that makes `dist/` unbundlable for
`MathPlugin` consumers — found by bundling, not by reading) and `T-028` (T-020's deferred
breaking half).

**Left open:** the nine developer-blocked tasks, plus the browser verification listed
above.

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
