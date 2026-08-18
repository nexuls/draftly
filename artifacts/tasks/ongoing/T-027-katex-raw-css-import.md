# T-027 — Published `dist/` references `katex/dist/katex.min.css?raw`, which most bundlers cannot resolve

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
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

## Acceptance

- [ ] `dist/` contains no bundler-specific import specifier
- [ ] A consumer can bundle `MathPlugin` from the published package with esbuild, Rollup,
      webpack and Vite
- [ ] KaTeX styling still applies in the playground
- [ ] Verified by building the published artefact, not by reading it

## Notes

- **2026-08-18:** discovered during C-024. Deliberately not folded into that commit —
  it is a packaging bug with a public-API-shaped fix, not a tree-shaking change, and the
  fix needs a decision the developer should make (option 1 changes what consumers must
  import).
- This is the reason C-024's before/after comparison has no "before" number: before the
  change, `import { draftly }` retained the KaTeX chunk and therefore **could not be
  bundled at all**. That is a stronger result than a size delta, but it is worth knowing
  that the two findings are entangled.
