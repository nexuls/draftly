# C-024 — `import { draftly }` pulls in Mermaid, KaTeX and node-emoji

**Status:** Complete (steps 1-3); **step 4 deferred** — see Outcome
**Priority:** High
**Created:** 2026-08-18
**Completed:** 2026-08-18

## Problem

`AGENTS.md` states bundle size is a design constraint and that it "is why `allPlugins` is
opt-in". Neither half currently holds.

### The barrel drags everything in

`src/index.ts` re-exports `./plugins`, and `plugins/index.ts` statically imports all 14
plugin modules. So `import { draftly } from "draftly"` — the form every README example
uses — reaches `mermaid`, `katex` and `node-emoji`.

### Those modules have real import-time side effects

- `math-plugin.ts:28` calls `injectKatexStyles()` at module scope, and
  `math-plugin.ts:12` inlines the whole of `katex.min.css` as a string via `?raw`.
- `mermaid-plugin.ts:13` calls `mermaid.initialize({...})` at module scope.

### `package.json` has no `sideEffects` field

```
$ grep -n "sideEffects" packages/draftly/package.json
$
```

Without it a bundler must assume every module has side effects and cannot drop unused
ones. And here the assumption is *correct* — the two calls above are genuine side effects,
so even declaring `sideEffects: false` would be a lie that breaks KaTeX styling.

Mermaid alone is on the order of a megabyte. Every consumer pays it, including consumers
who never write a diagram.

### `allPlugins` is not opt-in

`plugins/index.ts:58` — `const allPlugins = [...essentialPlugins]`. Same instances, same
modules, no difference. The distinction the constraint rests on does not exist.

### `zod` is an unused dependency

```
$ grep -rn "from \"zod\"" packages/draftly/src
$
```

Declared in `dependencies`, imported nowhere.

## Proposed approach

Four commits, roughly in this order — the first is free, the last is the real work.

1. **Drop `zod`.** One line, no risk.
2. **Remove the import-time side effects.**
   - KaTeX CSS: inject lazily on first widget construction, or better, ship it as a
     separate CSS entry point consumers import themselves — which is what the preview path
     already expects via `generateCSS()`. Module-scope DOM mutation is also an SSR hazard.
   - `mermaid.initialize`: move into `renderMermaid` behind a `let initialized = false`
     guard.
   Once both are gone, `sideEffects: false` becomes truthful.
3. **Add `"sideEffects": false`** to `packages/draftly/package.json` and verify with a real
   bundle analysis, not by inspection.
4. **Split the heavy plugins behind their own entry points.** `draftly/plugins/mermaid`,
   `draftly/plugins/math`, and possibly `draftly/plugins/emoji` as separate exports, kept
   out of the `plugins` barrel. Then make `essentialPlugins` genuinely exclude them and
   `allPlugins` genuinely include them, matching the documented intent. Consider dynamic
   `import()` inside the widgets so the cost is paid on first use rather than at load.

Alternative considered: making mermaid and katex peer dependencies. That pushes the
install burden onto every consumer including those who do want diagrams, for no size win
once they install them. Entry-point splitting is the better trade.

## Affected areas

- `packages/draftly/package.json` — `sideEffects`, `exports`, drop `zod`
- `tsup.config.ts` — new entry points
- `src/index.ts`, `plugins/index.ts` — barrel composition, collection membership
- `plugins/math-plugin.ts`, `plugins/mermaid-plugin.ts` — lazy init
- `README.md` — installation and import guidance for the heavy plugins
- `apps/web/app/playground/page.tsx` — imports
- `artifacts/repository-map.md` — subpath export map table
- `artifacts/architecture/build-and-tooling.md`
- `.changeset/` — this changes the public export surface

## Acceptance

- [ ] `import { draftly } from "draftly"` produces a bundle containing no mermaid or KaTeX
- [ ] Measured before/after bundle sizes recorded in Notes
- [ ] Importing the math or mermaid plugin still works and still styles correctly
- [ ] No module in `packages/draftly/src` mutates the DOM at import time
- [ ] `essentialPlugins` and `allPlugins` differ, and the difference matches the docs
- [ ] `zod` removed from `dependencies`
- [ ] Playground still exercises every plugin

## Notes

- Measure with `npx source-map-explorer` or `esbuild --analyze` against a minimal consumer
  app. A claim about bundle size without a number is not a claim.
- Interacts with T-017 — both change `plugins/index.ts` exports. If both are approved,
  sequence them together into one coordinated API change and one changeset rather than
  shipping two consecutive breaking releases.
- The `?raw` CSS import (`math-plugin.ts:12`) also requires the custom esbuild loader in
  `tsup.config.ts:24-29`. Removing it simplifies the build config as a bonus.


## Outcome

Landed as `perf(draftly): Make the barrel tree-shakeable`. **Steps 1-3 of the four
proposed. Step 4 is deliberately not done** — see below.

### 1. `zod` dropped

Declared in `dependencies`, imported nowhere. One line.

### 2. Import-time side effects removed

- `injectKatexStyles()` moved from module scope into `renderMath()`, the single point both
  the widgets and the preview renderer pass through. The existing element-id guard already
  made it idempotent, so nothing else changed. This also removes an SSR hazard: the old
  call touched `document` during module evaluation.
- `mermaid.initialize()` moved into `renderMermaid()` behind a `mermaidInitialized` flag.

### 3. `"sideEffects": false`

Now truthful, which it would not have been before step 2 — the task was explicit that
declaring it earlier would be a lie that breaks KaTeX styling.

### Verification — by bundling, not by reading

Built `dist/`, then bundled `import { draftly } from "draftly"` with `bun build --minify`,
CodeMirror external:

- **After: 6,233 bytes**, containing zero occurrences of `mermaid`, `katex` or `emoji`.
- **Before: the bundle could not be produced at all.**

That last point needs explaining, and it turned up a second bug. The KaTeX chunk contains
`import katexCss from "katex/dist/katex.min.css?raw"` — a Vite-specific specifier that
survives into `dist/` because tsup's `.css: "text"` loader does not match a path ending in
`?raw`. Any bundler that retains that chunk fails to resolve it. Before this change the
chunk was always retained, so **the published package could not be bundled by a
non-Vite-style bundler at all**; after it, the chunk is dropped for consumers who do not
use `MathPlugin`, and the failure only reappears for those who do.

Filed as **T-027**, not folded in here: it is a packaging bug whose best fix (a separate
`draftly/katex.css` entry point) is a public API addition and the developer's call.

### Step 4 — deferred, deliberately

Splitting mermaid, math and emoji behind their own entry points and changing what
`essentialPlugins` and `allPlugins` contain is a **breaking change to the public export
surface**. Two reasons to stop short of it:

- The boundaries rule says to flag public API changes rather than take them.
- The task index already notes that step 4 overlaps **T-017**, which is blocked on a
  developer decision about whether plugin collections become factories. Both change
  `plugins/index.ts` exports, and the index itself says to coordinate them into one API
  change and one changeset.

Steps 1-3 deliver most of the practical benefit without that: a consumer importing only
`draftly` now pays nothing for the heavy plugins. What step 4 adds on top is making
`essentialPlugins` genuinely differ from `allPlugins`, which is a correctness fix for the
documentation rather than a size win for the common case.

The remaining work is tracked as **T-028**.