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
  layout and cursor motion. `CodePlugin.computeBlockWrappers` is a third, for the same
  facet reason (C-038). `buildNodes` is also still document-wide — that is T-013.
- **Block-level vertical spacing in the editor belongs on an `EditorView.blockWrappers`
  wrapper, never on a `.cm-line`.** CodeMirror measures line heights from the DOM, so a
  line's margin desyncs the height map — but `measureVisibleLineHeights` *does* account
  for a wrapper's padding, via the `spaceAbove` it tracks from the wrapper's bounds. That
  makes wrapper padding the one sanctioned way to put a gap around a block (C-038, code
  blocks; `TablePlugin` had the first wrapper). Padding the block's own first and last
  line is not a substitute when those lines paint the block's background and border — it
  grows the coloured box, not the gap. A block widget spacer is not an option either:
  CodeMirror refuses block widgets from a view plugin's decorations, which is where every
  Draftly decoration comes from.
- **A wrapper swallows the `cm-gap` of a partially rendered block.** When only the top of
  a wrapped block is on screen, the placeholder element standing in for the rest of the
  document nests inside the wrapper, so wrapper padding-bottom lands after the gap rather
  than at the block's end. Invisible as long as the wrapper paints nothing, and it
  self-corrects as the block renders.
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
- **Build plugins with `createEssentialPlugins()` (`draftly/plugins`) or
  `createAllPlugins()` (`draftly/plugins/all`), one set per editor** (C-026). The old
  shared-singleton `essentialPlugins` / `allPlugins` arrays were removed in C-028; the
  factories are now the only way to build a set.
- **Mermaid's `renderMermaid` de-duplicates in-flight renders, and deliberately caches
  nothing** (C-030). If you ever extend that map to hold settled results, you re-introduce
  both failure modes the design avoids — a stale diagram after an edit, and a transient
  failure pinned permanently — neither of which is checkable without a browser. Shared
  renders also mean two identical SVGs with identical internal element ids; that is known,
  harmless, and the price of sharing.
- **A stylesheet injected as a `<style>` element loses its relative URLs.** They resolve
  against the *page* URL, not the package the CSS came from. This silently broke every
  KaTeX font for every consumer from C-025 until C-029, which inlines the woff2 faces as
  `data:` URIs (359 KB; the woff and ttf fallbacks are dropped rather than tripling that).
  The same applies to any future vendored CSS with `url()` in it.
- **`katex` is an optional peer dependency and `external` in tsup**, and `MathPlugin`
  injects no CSS unless `injectStyles: true`. The generated stylesheet is reached only
  through a dynamic `import()` so the default path does not pay for it — **a static import
  of `katex-styles.generated.ts` puts 359 KB back into the math chunk** and nothing will
  fail visibly. tsup splits it out on both ESM and CJS; verified in `dist/` at C-029.
- **A tsup entry point is a bundling boundary, and the only one that works for a heavy
  dependency.** Everything reachable from an entry is concatenated into one chunk, and that
  chunk's *top-level* `import mermaid from "mermaid"` is evaluated whenever any binding in
  it is used. So while all 14 plugins shared `plugins/index.ts`,
  `import { HeadingPlugin } from "draftly/plugins"` bundled to **8.0 MB**; after C-027 it is
  2.5 MB. `sideEffects: false` (C-024) does not help here — it lets a bundler drop
  *draftly's* modules, not a third-party package it cannot prove pure — and CJS consumers
  get no tree-shaking at all. `MermaidPlugin`, `MathPlugin` and `EmojiPlugin` therefore
  live at `draftly/plugins/{mermaid,math,emoji}`, and `createAllPlugins()` at
  `draftly/plugins/all` rather than beside `createEssentialPlugins()`. **Adding a heavy
  plugin to `plugins/index.ts` silently reverts all of it**, and nothing will fail — the
  only symptom is the bundle.
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
- **Bump `VERSION` in `apps/web/src/routes/playground/use-documents.ts`** after editing
  seed markdown in `src/content/`, or returning readers keep the cached old copy.
- **`apps/web` is Vite + React, not Next.js** (C-031). It imports `draftly/src`, which is
  why `vite.config.ts` widens `server.fs.allow` to the repo root and excludes `draftly`
  from `optimizeDeps` — without the first the raw-TS imports 403 in dev, without the second
  they freeze at dev-server start.
- **`@workspace/typescript-config/vite.json` leaves `noUnusedLocals` and
  `noUnusedParameters` off on purpose.** Type-checking `apps/web` also type-checks the
  library source it imports, so those flags turn `packages/draftly`'s warning backlog into
  errors in the app. Turning them on will look like a tightening and will actually just
  break `bun run typecheck`.
- **The app's `@theme inline` block is what themes the library.** Draftly's tokens read
  `--color-background`, `--color-foreground`, `--color-primary`, `--color-border`,
  `--color-muted-foreground` and `--color-destructive` off the host page, and
  `--font-jetbrains-mono` off it too. Changing the app palette changes the editor and the
  generated preview CSS as a side effect — that is the design, not a leak.
- **Two `EditorView.theme()` extensions targeting the same selector are resolved by
  `StyleModule` creation order, not extension order.** `Prec` does not help. The only
  order-independent way to override one is to win on specificity — `apps/web`'s
  `sourceFaceTheme` writes `&.cm-editor .cm-content` to buy a class over the base theme's
  `.cm-content`.
- **Providing `onNodesChange` is what costs, so gating it means reconfiguring.** The view
  plugin reports nodes unprompted only from its *constructor*, and reconfiguration does not
  re-run it; `update()` rebuilds the tree only on a doc, selection or viewport change. A
  consumer that toggles the callback must re-dispatch the current selection to get an
  initial tree. This is the concrete cost T-013 would remove.
- **`createEssentialPlugins()` can be called for its metadata.** The landing page's plugin
  index reads `name`, `version` and `requiredNodes` off a set it never attaches to an
  editor, so the table cannot drift from the factory. The heavy three stay hard-coded there
  — importing them to read their names would put mermaid and KaTeX back on the entry chunk.
- **Playwright's Chromium is installed on this machine** (`~/.cache/ms-playwright`), so the
  playground checklist *can* be run and screenshotted by script even with no browser tool.
  The segmented rails are visually hidden radio inputs: drive them with
  `.check({ force: true })`, not `.click()`.
- **CodeMirror's line heights are estimates until the line has been drawn**, and the
  estimate is replaced on render — so the editor's `scrollHeight` creeps as the reader
  travels, and anything measured from the height map (`lineBlockAt().top`) for an off-screen
  line is provisional. Anything that positions against it has to re-measure rather than
  compute once. `MermaidPlugin` and `MathPlugin` widen the window: they render
  asynchronously, so the heights move again a second or so after the scroll that revealed
  them. Cost three rounds of measurement bugs in C-033.
- **Asserting on `.cm-line` by index is a test that passes without testing anything.**
  CodeMirror virtualizes the document, so the first rendered `.cm-line` is whichever line
  the viewport starts at, not line 1 — after a `Control+End` it is near the bottom. A
  caret/retraction check must locate the line by its *text* and click it. Cost one
  false pass in C-032.
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
- **Lezer wraps a list item's text in a `Paragraph`, so anything that styles paragraphs
  styles list items too.** `ParagraphPlugin` padded every item line on both edges until
  C-037 — 1em per item, which made every tight list read as a loose one. The same applies
  to any future paragraph-level rule; the node is not a reliable proxy for "a paragraph of
  prose".
- **A preview-side CSS override has no editor counterpart when the override needs an
  ancestor.** `ListPlugin` zeroes the padding with `.cm-draftly-list li
  .cm-draftly-paragraph`, which works only because preview emits a real `<li>`. The
  editor's lines are a flat sequence of `.cm-line` elements, so a descendant selector has
  nothing to descend from and the decision has to move into `buildDecorations`. Expect the
  two surfaces to need *different mechanisms* for one rule more often than they need
  different rules — and say so in a comment, or the next reader will try to unify them.
- **The editor's list bullet is a CSS `::after`, the preview's is a real `::marker`.** The
  editor has no `<li>`, so `ListPlugin` draws the bullet itself and has to state a colour;
  preview sets `list-style-type` and the browser inherits the text colour. An explicit
  token on the editor side therefore shows up as a colour the preview does not have —
  `currentColor` is what keeps them equal.
- **`buildDecorations` is verifiable with no browser.** An `EditorState`, `ensureSyntaxTree`
  and a hand-rolled `DecorationContext` whose `iterateVisible` forwards to `tree.iterate`
  dump decorations per line; most plugins only touch `ctx.view.state.doc`, so `{ state }`
  stands in for the view. Diffing that against `git show HEAD:<plugin>` proves a decoration
  change does exactly what it claims. Used in C-037, and the shape a real test suite would
  take (T-001).
- **Whitespace that the editor renders as structure is lost by default in preview.** A
  blank source line is a real `.cm-line` one line-height tall in the editor; as gap text in
  `renderChildren` it is a `\n`, and HTML collapses it. `renderGap` now emits a
  `.draftly-blank-line` spacer per blank line (C-036). The general shape of the bug is
  worth keeping: parity holds for anything the tree has a *node* for, because a plugin owns
  both surfaces, and silently fails for anything carried by the gaps between nodes — there
  is no plugin to own it, so it is the renderer's job or nobody's.
- **A gap's first and last segments are usually partial lines, but not always.** A gap runs
  end-of-node to start-of-next, so segment 0 is normally the tail of the previous node's
  line. `Heading`'s `to` sits at the start of the *following* line, though, and
  `Paragraph`'s can — so a gap can genuinely begin at a line start, and anything reasoning
  about lines inside a gap has to check `doc[from - 1] === "\n"` rather than assume.
  Assuming cost one off-by-one that only showed up after headings.
- **Do not reach for the `lh` unit in library CSS.** `height: 1lh` is exactly the right
  thing to say for "one editor line" and lands in Chrome only from 133. An unsupported
  declaration is *dropped*, so the fallback is a zero-height element and nothing logs —
  the same class of silent failure as a dark rule losing on specificity. `calc(1em *
  var(--draftly-line-height))` says it in units everything understands, which is why the
  base line-height is a token now instead of two copies of `1.6`.
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
- **A second checkout exists at `/media/D/projects/draftly`, and it is ahead of `origin`.**
  It is the pre-Vite generation of this repo and holds two commits that were never pushed:
  the changeset for 2.1.0 and its `RELEASING:` version bump. That is why npm served
  `draftly@2.1.0` while this repo's `package.json` said `2.0.0` and its `CHANGELOG.md`
  stopped at 2.0.0 — the *code* for 2.1.0 is here (shared history up to `e5dc598`), only the
  bookkeeping was missing. Re-imported by hand in C-034. **Before trusting the repo's
  version field against npm, check that checkout.** Anything else released from there has the
  same shape of divergence.
- **`npm pkg get <field>` inside a workspace member answers with a package-keyed JSON
  object**, not a bare value — npm resolves up to the workspace root even when run from
  `packages/draftly`. So `npm pkg get version` prints `{\n  "draftly": "3.0.0"\n}`, and
  piping that into `$GITHUB_OUTPUT` fails with `Invalid format`. `--no-workspaces` fixes it,
  but `node -p "require('./package.json').version"` is what the release workflow uses: no
  npm semantics to get wrong. `npm version --no-workspaces` *is* correct in the same
  directory, which is what made the asymmetry easy to miss. Cost one failed dry run (C-034).
- **The release publishes with no npm token — trusted publishing over OIDC.** Do not
  "fix" an auth failure by adding an `NPM_TOKEN` secret back. A token publish fails with
  `EOTP` because the account enforces 2FA for writes, and the classic automation token that
  used to bypass that was revoked by npm in November 2025. If a publish fails, the cause is
  almost certainly the trusted-publisher registration on npmjs.com (owner, repo and
  **workflow filename**, all case-sensitive, validated only at publish time) or an npm older
  than 11.5.1 — both of which surface as a misleading **`E404`**, not as an auth error.
  Renaming `release.yml` breaks publishing until the registration is updated.
- **Releasing no longer touches the working tree.** There is no `bun run release`: the
  **Release** workflow is dispatched manually and does the versioning, tagging and
  publishing itself. Running `npm publish` locally would skip the already-published and
  already-tagged guards, which are the only thing standing between a mistyped input and a
  wasted version number.

### Biome facts worth not re-deriving

- Biome 2.x allows **exactly one** config with `"root": true` in a repo. Every workspace
  config must set `"root": false` or Biome errors out.
- `"rules": { "recommended": true }` is **deprecated** in 2.5.x — the current spelling is
  `"preset": "recommended"`. `bunx biome migrate --write` converts it.
- Ignore patterns must **not** carry a trailing `/**` (`"!**/dist"`, not `"!**/dist/**"`).
  The old form is flagged by `suspicious/useBiomeIgnoreFolder`.
- `css.parser.tailwindDirectives: true` is required or `apps/web/src/styles/globals.css`
  fails to parse on `@theme` / `@custom-variant`. Likewise `json.parser.allowComments` +
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
8. **No agent co-authorship in commits.** Stated 2026-10-21, as a strict instruction: do
   not add a `Co-Authored-By` trailer for Claude or any other agent. The maintainer is the
   only author on the history. This **overrides the attribution trailer the Claude Code
   harness asks for by default** — that instruction defers to the developer's own, so there
   is nothing to reconcile and nothing to ask about. Commits made before that date keep
   their trailer; the instruction was "from now on" and history was not rewritten.

---

## Open questions for the developer

Unresolved. Do not act on these unilaterally — raise them when the topic comes up.

| #   | Question                                                                                                                                                            | Context                                                                                                                 | Raised     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | The public README documents a `themeStyle` config option that does not exist on `DraftlyConfig`. Was it removed, renamed, or never implemented?                     | `README.md` config table vs `editor/draftly.ts:29`. Consumers following the README will pass a silently ignored option. | 2026-08-18 |
| 2   | The README shows `preview()` used synchronously (`const html = preview(...)`), but it returns a `Promise<string>`. Fix the docs, or was a sync path intended?       | `README.md` preview example vs `preview/preview.ts:24`. Following the README renders `[object Promise]`.                | 2026-08-18 |
| 3   | `DraftlyPlugin.dependencies` is declared but nothing reads it — no topological sort, no validation. Finish it or remove it?                                         | `editor/plugin.ts:61`                                                                                                   | 2026-08-18 |
| 4   | `turbo.json` declares a `check-types` task but the packages define `typecheck`. Nothing connects them, so `turbo run check-types` matches nothing. Which name wins? | `turbo.json` vs `packages/*/package.json`                                                                               | 2026-08-18 |
| 5   | Should a test runner be introduced, and if so `bun test` or Vitest? The pure layers (`editor/utils.ts`, table text utilities) are trivially testable.               | No test infrastructure exists anywhere in the repo. Since C-034 the release workflow has a test step that probes for `*.test.ts(x)`/`*.spec.ts(x)` and runs `bun test` if any exist — so `bun test` needs no CI change, Vitest needs one line. | 2026-08-18 |
| 6   | Split `table-plugin.ts` (1759 LOC) and `code-plugin.ts` (1368 LOC) into directories? Both are far past the ~500 LOC ceiling other plugins respect.                  | The table plugin was reworked very recently (`e5dc598`); a large move would obscure that history.                       | 2026-08-18 |
| 7   | 91 Biome warnings are outstanding after the ESLint→Biome migration — mostly `noNonNullAssertion` (34) in the plugins. (The a11y findings went away with `packages/ui`; ~70 remain, all in `packages/draftly`.) Burn them down, or pin the rules off permanently? | `packages/biome-config/base.json` severity table; see `artifacts/architecture/build-and-tooling.md`. | 2026-08-18 |
| 8   | `PreviewRenderer`'s `theme` and `sanitizeHtml` private fields are assigned in the constructor but never read (`noUnusedPrivateClassMembers`). Dead state, or a wiring bug in the preview pipeline? | `preview/renderer.ts:18,21`. Left in place rather than deleted, per the "ask, don't resolve unilaterally" rule. | 2026-08-18 |
| 9   | ~~`essentialPlugins` / `allPlugins` export shared mutable instances.~~ **Answered 2026-08-18: option A, factories.** Shipped in C-026 as a *minor* — factories added, arrays deprecated but behaviourally unchanged. **Fully answered 2026-08-21: remove.** Shipped in C-028 as a major. | `plugins/index.ts`; C-026 | 2026-08-18 |
| 10  | `ThemeEnum.AUTO` is the default and applies neither theme layer. Implement real system detection (behaviour change for every consumer) or rename it to something honest like `DEFAULT`? | `editor/utils.ts:68`; T-026 | 2026-08-18 |
| 11  | ~~With `sanitize: false`, should `HTMLPlugin` emit raw HTML or escape it?~~ **Answered provisionally in C-012: honour the flag literally** — raw HTML with `sanitize: false`, sanitized with the default `true`. Confirm or overturn. | `plugins/html-plugin.ts`; C-012 | 2026-08-18 |
| 12  | `onNodesChange` is public API and eagerly builds a full node tree on every update. Change the signature to a lazy getter (breaking), add a parallel option, or accept the cost? | `editor/view-plugin.ts:124`; T-013 | 2026-08-18 |
| 14  | With `sanitize: true` and no DOM and no `sanitizer`, preview passes HTML through (now with a warning). Should it instead **escape** the HTML, so the default is safe everywhere? That is a behaviour change for existing SSR consumers, whose HTML blocks would start rendering as visible source. | `preview/context.ts`; C-013 | 2026-08-18 |
| 15  | `codemirror-lang-latex` is **AGPL-3.0-or-later** and `draftly` is MIT. Taking it as a dependency — even lazily imported — would push copyleft terms onto every consumer, so `MathPlugin` accepts an injected parser instead. Confirm that injection is the intended long-term shape, or is a differently-licensed LaTeX parser worth vendoring? | `plugins/math-plugin.ts`; the fork this came from is an app, where the licence question does not arise the same way. | 2026-08-18 |
| 16  | Plugin themes emit their editor-only rules into preview CSS and vice versa — e.g. `.cm-draftly-list-line-ul`'s flex layout is in the generated preview stylesheet, matching nothing. Split each plugin theme into editor/preview/shared halves, as `editor/theme.ts` now does? | `editor/plugin.ts` `getPreviewStyles`; noticed while fixing the list-class leak. | 2026-08-18 |
| 17  | ~~KaTeX's bundled CSS references its fonts relatively, so injecting it as a `<style>` element 404s them.~~ **Answered 2026-08-21.** `katex` became an optional peer dependency; `MathPlugin` ships no CSS unless `injectStyles: true`, which injects the stylesheet with all 20 faces base64-inlined, behind a dynamic `import()`. Shipped as C-029. | `plugins/math-plugin.ts`, `plugins/katex-styles.generated.ts`; C-025, C-029 | 2026-08-18 |
| 18  | `heading-plugin.ts` hardcodes `fontFamily: "sans-serif"` on all six heading levels, bypassing the `--draftly-font-sans` token that `editor/theme.ts` defines and that the base theme uses. A host that sets `--font-sans` gets its face everywhere *except* headings, on both surfaces. Deliberate (headings should always be sans) or an oversight from before the token layer? | `plugins/heading-plugin.ts:140-175` vs `editor/theme.ts:21,136`; surfaced while theming `apps/web` in C-031 | 2026-10-21 |
| 19  | The split view's scroll-sync helper (`apps/web/src/lib/scroll-sync.ts`) is exactly what `AGENTS.md` describes as belonging in `packages/draftly/src/lib/` — any consumer showing an editor beside a preview wants it. It is in the app because moving it is a public API addition. Promote it, or is pane-layout glue out of scope for the library? | `apps/web/src/lib/scroll-sync.ts`, `routes/playground/use-linked-scroll.ts`; C-033 | 2026-10-21 |
| 13  | `draftlyThemeFacet` is defined and populated but never read — the theme is baked in at extension-construction time instead. Wire the facet up (enables runtime theme switching) or delete it? | `editor/view-plugin.ts:29,185`; T-024 | 2026-08-18 |

---

## Session log

### Session 2026-10-21 — editor/preview spacing parity

Developer reported two spacing mismatches between the surfaces, in opposite directions.
Shipped as C-036 (blank lines missing from the preview) and C-037 (list items over-padded
in the editor).

**The bug had no plugin to live in, and that is the interesting part.** Every parity
mechanism in the architecture is plugin-shaped — one class owns a node's decorations and
its HTML — and a blank line has no node. It arrives as gap text in `renderChildren`, which
is renderer territory, so no amount of plugin discipline would have caught it. When
something looks like a parity bug, check whether the construct is a node at all before
going looking for the plugin that owns it.

**The developer asked to verify before any code was written, and before any commit.**
Stated twice in one session. Worth treating as the default rhythm for rendering work:
propose and show the output, let them look, then commit.

**The fix changes published output for every consumer** — one line-height per paragraph
break in preview. Flagged rather than buried, and accepted, because exact parity was the
request. No API or type changed, so nothing surfaces it except the look.

**Then the mirror image: the editor was over-padding list items** (C-037). Worth noting
how the two were found, because neither surface is the authority. The developer named which
side looked right each time — "preview is perfect" for the lists — and that is the fastest
way to locate a parity bug: find the surface that already handles the case and read how,
rather than deciding from first principles which rendering is correct. Here the answer was
one CSS rule in `ListPlugin`'s preview theme, which pointed straight at the cause.

**The parity rule can be right while the mechanism has to differ**, and that is not drift.
See the new trap above. Both fixes this session were of that shape.

### Session 2026-10-21 — Changesets out, a manual release workflow in

Developer asked for Changesets to be removed and publishing moved to a manually-triggered
GitHub Actions workflow. Shipped as C-034.

**The repo had 30 unconsumed changeset files.** Every user-facing note written since 2.1.0
was sitting in `.changeset/`, unpublished, because `version` and `publish` were always
manual steps nobody ran. That is the real argument against the tool here, and worth
remembering before proposing a ceremony-per-change workflow to this project again: a
process that needs a second manual step to pay off will not pay off. They were folded into
one last `## 3.0.0` section — six majors among them, which is where 3.0.0 came from — and
`CHANGELOG.md` is now a closed record of that era.

**The version drift was a second checkout, not a mystery.** npm said 2.1.0, the repo said
2.0.0. Asking rather than guessing produced the answer in one turn; see the new trap above.
The lesson generalises: a version that disagrees with npm is a missing commit somewhere
before it is a bad release.

**`apps/web` gets versioned by `changeset version` even though it is private.** It bumped
to 0.1.1 with a changelog of bare "Updated dependencies" hashes. Reverted — a private
playground has no version anyone can consume. Irrelevant now the tool is gone, but it
explains the `0.1.x` history in `apps/web/CHANGELOG.md`.

**The release notes generator is the reason the commit format is now load-bearing twice
over.** `.github/scripts/release-notes.ts` groups `git log` by conventional-commit type. An
unprefixed subject does not fail — it lands under "Other changes", which is visible enough
to be fixed next time but never drops a commit.

### Session 2026-10-21 — linked scrolling in the split view

Developer asked for the scroll sync C-032 had declined to build. Shipped as C-033.

**The declining was half right and worth re-reading.** C-032 said a shared scroll position
"could only be guessed from heading order". That was true of the solution it had in mind —
proportional scrolling — and false of the one that works. Headings used as explicit
correspondence points are exact *at* every heading and interpolated between, which is a
different thing from guessing the documents are the same shape. Measuring first settled it:
the two columns differ in total height by 36% on the walkthrough, so proportional really
would have been wrong, and anchors really are needed.

**Everything hard about it was measurement, not mapping.** The piecewise-linear math was
right the first time and never changed. Three separate bugs all came from *when* the
anchors were measured — once per gesture is stale by the end of a long one; one correction
pass is a fixed-point iteration stopped after one step; a fixed 80ms delay finishes before
Mermaid and KaTeX have rendered. See the new trap above; it generalises past this feature.

**The test lied again, the same way as last session.** A prefix match on editor line text
reported 200–1100px of drift at three headings; they were body lines starting with the same
words. Exact matching showed ≤1px and the implementation had been correct throughout. Two
sessions in a row the instrument was the broken part — on this codebase, when a measurement
disagrees with an otherwise sound mechanism, suspect the probe first.

### Session 2026-10-21 — playground split view

Developer asked for a split view so the editor and the preview can be compared directly.
Shipped as C-032, one commit, no library code.

**The architecture made this small, which is the point worth recording.** Everything that
branches on the playground mode asks whether it is `"source"` or `"export"`, so a new
`"split"` member fell through to the decorated editor with no change to
`useEditorExtensions` or `EditorPane`. The new module takes both panes as `ReactNode` and
owns only the layout, so it cannot drift from either. The one place that genuinely had to
know about the new mode is `usePreview`'s `enabled` gate — and that one fails *silently*,
with an empty column and no error, which is why it is now written down in
`architecture/web-playground.md`.

**Scroll sync was asked for implicitly and deliberately not built.** Correlating the two
columns needs a source-line mapping that `preview()` does not emit. The honest version is
`data-line` attributes from the renderer — a library change with a public output-shape
consequence. Approximating it from heading order would have been a guess that looks like a
feature.

**A verification script can report a false pass.** The first retraction check read
`.cm-line` by index after moving the caret with `Control+End`; CodeMirror virtualizes, so
it was reading a line nowhere near the caret and "passing". See the new trap above.

### Session 2026-10-21 — Next.js → Vite, playground rebuilt

Developer asked to drop Next.js from `apps/web`, scaffold Vite + React, put shadcn inside
the app rather than the root, and rebuild the playground UI from the ground up because the
existing one "looks too cheap". Shipped as C-031 in six commits.

**Decisions taken with the developer up front**, because each changed the shape of the
work: delete `packages/ui` outright; keep both a landing page and a playground on
`react-router`; editorial/typographic direction.

**Where the design came from.** Grounding it in the library's actual mechanic rather than
in "writing app" generally is what made it specific. Retraction is a proofreading idea, so
the whole surface is a proof sheet — cool paper, ink blue, a blue pencil for anything
actionable. The generic-AI-design cluster was avoided by name: no cream-and-terracotta, no
zero-radius broadsheet, no grid of identical cards.

**The serif did not survive.** Setting the *interface* in the same serif as the prose
(Newsreader) was the deliberate risk of the first pass, and the developer rejected it the
same day: Inter everywhere, JetBrains Mono for code. Worth remembering as a preference —
the editorial read here has to come from the palette, the hairlines and the single raised
page, not from the face. The swap itself was four files (`fonts.css`, the `@theme` stacks,
two comments) plus a retune of the body line-heights, because Inter's x-height needs less
leading than the serif did.

**Verification was better than expected.** There is no browser tool here, but Playwright's
Chromium is on the machine, so the 8-step playground checklist ran as a script against the
dev server with screenshots of every surface in both themes plus a 390px viewport. Reading
those screenshots caught four things static review would not have: the copy button sitting
on top of line 1 of the install command, the export panes inheriting the prose serif, the
syntax tree staying empty until the next keystroke, and no theme control at all below
`sm`. **Screenshot the thing.**

**The `StyleModule` ordering trap cost the most time.** Appending a mono `EditorView.theme`
after the base one did nothing, because competing CodeMirror themes resolve by the order
their `StyleModule`s were *created*, not by extension order — so the fix depended on import
order, which is to say it was not a fix. Winning on specificity (`&.cm-editor .cm-content`)
is the version that holds.

**Found and did not touch:** `heading-plugin.ts` hardcodes `fontFamily: "sans-serif"`,
which is why headings ignore the host's font on both surfaces (with Inter now set on
`--draftly-font-sans`, headings render in the browser's generic sans instead). It contradicts the token
layer rather than merely predating it, and it is library code outside this task — logged as
open question 18 instead of being "fixed".

**Also removed along the way:** three shadcn primitives the CLI pulled that nothing
imported, and the stray `cn` npm package the current registry adds (its generated
components import `cn` from a package rather than from the local `lib/utils`).

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
