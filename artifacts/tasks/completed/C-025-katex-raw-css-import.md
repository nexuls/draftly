# C-025 — Published `dist/` references `katex/dist/katex.min.css?raw`, which most bundlers cannot resolve

**Status:** Complete
**Priority:** High
**Created:** 2026-08-18
**Completed:** 2026-08-18
**Blocked on:** —

## Problem

Found while verifying C-024's bundle analysis, not by inspection.

`math-plugin.ts:12` imports the KaTeX stylesheet as a string:

```ts
// @ts-expect-error - raw import for CSS as string
import katexCss from "katex/dist/katex.min.css?raw";
```

`tsup.config.ts` sets `esbuildOptions.loader[".css"] = "text"`, which is meant to inline
it. **It does not apply**, because the specifier ends in `?raw` rather than `.css`, so
esbuild treats it as an unresolvable path and leaves the import statement intact. The
published `dist/` therefore contains a literal
`import katexCss from 'katex/dist/katex.min.css?raw'`.

`?raw` is a Vite convention. A consumer bundling the published package with anything that
does not implement it fails outright:

```
error: Could not resolve: "katex/dist/katex.min.css?raw"
```

Reproduced with `bun build` against `dist/`. Any consumer who actually uses `MathPlugin`
hits this; it went unnoticed because the playground imports `draftly/src` through Next.js
rather than consuming `dist/`, and because before C-024 the chunk could not be
tree-shaken, which meant *nothing* consuming the barrel could be bundled either.

## Proposed approach

The obvious one-line fix — drop `?raw` so the `.css` loader applies — must be checked
against `apps/web` first, which imports `draftly/src` directly. If Turbopack resolves the
bare `.css` import as a module rather than as text, that breaks the playground, and the
two consumers need different specifiers.

Options, roughly in order of preference:

1. **Ship the KaTeX CSS as a separate entry point** — `draftly/katex.css` — that consumers
   import themselves. This is what T-020 step 2 already recommends, it matches how the
   preview path expects styling to arrive (`generateCSS()`), and it removes the
   string-inlining problem entirely rather than relocating it. It is a public API addition
   and needs a changeset and README guidance.
2. **Drop `?raw` and rely on tsup's `.css: "text"` loader**, with a Turbopack check for
   the playground.
3. **Read the file at build time** and emit it as a generated TypeScript constant, so no
   bundler-specific import syntax appears in source or in `dist/` at all.

## Affected areas

- `packages/draftly/src/plugins/math-plugin.ts` — the import
- `packages/draftly/tsup.config.ts` — loader config or a new entry
- `packages/draftly/package.json` — `exports`, if option 1
- `apps/web` — verify the playground still resolves it
- `README.md` — if consumers must import the stylesheet themselves

## Outcome

**Option 3** — a generated TypeScript constant. Options 1 and 2 were both rejected on
verification grounds rather than taste:

- **Option 1** (`draftly/katex.css` entry point) is a public API addition. The task itself
  flagged that it "needs a decision the developer should make", and nothing in the bug
  requires an API change to fix, so making one unilaterally would have violated working
  rule 1.
- **Option 2** (drop `?raw`, rely on tsup's `.css: "text"` loader) fixes `dist/` but leaves
  a bare `.css` import in `src/` — and `apps/web` imports `draftly/src`, where Next.js
  resolves a `.css` import as a stylesheet side effect, not as a string. It would have
  traded a broken `dist/` for a broken playground.

Option 3 is the only one that is correct on **both** entry points, because the import is no
longer special in any way.

- `scripts/generate-katex-css.ts` reads the installed `katex/dist/katex.min.css` and emits
  `src/plugins/katex-css.generated.ts` — a plain `export const katexCss = "…"`. Run with
  `bun run generate:katex-css`; re-run after bumping `katex`. The KaTeX version is written
  into the generated file's doc comment so drift is visible in review.
- The output is **committed**, not built on demand: `package.json` exposes `./src`, and
  `apps/web` consumes it, so a fresh clone must work without a build step.
- `tsup.config.ts`'s `esbuildOptions` block is gone. It existed only for this import, and
  no other `.css` import exists in `src/`.
- `packages/biome-config/base.json` now excludes `**/*.generated.ts`. Generated output
  should not be formatted or linted, and a 23 KB single-line string literal is exactly the
  case that makes that obvious.

## Acceptance

- [x] `dist/` contains no bundler-specific import specifier — `grep` over the rebuilt
      `dist/` finds no `katex.min.css?raw` in either the ESM or the CJS chunk. Before the
      change both carried it (`chunk-NH5LOFRI.js`, `chunk-LP6NW3YL.cjs`).
- [x] A consumer can bundle `MathPlugin` from the published package — `bun build` (esbuild)
      on `import { MathPlugin } from "draftly/plugins"` now succeeds where it previously
      failed with `Could not resolve`, and the KaTeX CSS is present in the output bundle.
      `node -e 'require("draftly/plugins")'` loads the CJS build and constructs the plugin.
      **Rollup, webpack and Vite were not run** — none is installed in this repo. The claim
      rests on the specifier now being an ordinary relative TypeScript import, which is not
      bundler-specific by construction, rather than on four green builds.
- [x] KaTeX styling still applies in the playground — `apps/web` builds, and the KaTeX
      stylesheet is present in the emitted client chunk
      (`.next/static/chunks/…js` contains `KaTeX_AMS-Regular`). **Not visually confirmed**;
      no browser available.
- [x] Verified by building the published artefact, not by reading it

## Notes

- **2026-08-18:** discovered during C-024. Deliberately not folded into that commit —
  it is a packaging bug with a public-API-shaped fix, not a tree-shaking change, and the
  fix needs a decision the developer should make (option 1 changes what consumers must
  import).
- **2026-08-18 (implementation):** a finding that is *not* fixed here. KaTeX's
  `@font-face` rules reference `fonts/KaTeX_*` **relatively**. Injected into a document as
  a `<style>` element, those URLs resolve against the page URL, not the package, so a
  consumer gets KaTeX's layout with fallback glyphs unless they happen to serve
  `/fonts/KaTeX_*` themselves. This is pre-existing and orthogonal to the packaging bug —
  every option in this task inlines the same relative URLs — but it does mean the shipped
  CSS has never been self-sufficient. Raised as open question 17; it is the strongest
  argument for option 1 after all, since "import the stylesheet yourself" is the only
  variant where the fonts resolve.
- This is the reason C-024's before/after comparison has no "before" number: before the
  change, `import { draftly }` retained the KaTeX chunk and therefore **could not be
  bundled at all**. That is a stronger result than a size delta, but it is worth knowing
  that the two findings are entangled.
