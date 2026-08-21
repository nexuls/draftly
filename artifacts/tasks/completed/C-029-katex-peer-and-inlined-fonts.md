# C-029 — KaTeX becomes a peer dependency; fonts are inlined behind an opt-in

**Status:** Complete
**Priority:** Medium
**Created:** 2026-08-21
**Blocked on:** —

## Problem

Open question 17, surfaced by C-025. `MathPlugin` injected KaTeX's stylesheet into the
document head as a `<style>` element. KaTeX's `@font-face` rules reference `fonts/KaTeX_*`
**relatively**, and a `<style>` element resolves relative URLs against the *page* URL — not
against the package the CSS came from. So the fonts 404 for every consumer who does not
happen to serve them from that path, and math has been rendering in a fallback face since
the plugin shipped.

Compounding it, `katex` was a bundled runtime dependency, so a consumer who also imported
`katex/dist/katex.min.css` themselves ended up with two copies of the library.

## Approach

The developer's call, 2026-08-21, over the three options in the open question:

1. **`katex` moves to `peerDependencies`**, marked optional in `peerDependenciesMeta`, and
   is added to tsup's `external` list so it is no longer bundled. It stays a devDependency
   so the workspace still resolves it.
2. **`MathPluginOptions.injectStyles`**, default `false`. Left alone, Draftly ships no math
   CSS and the consumer imports `katex/dist/katex.min.css` — the cheap path, and the one a
   build step handles best.
3. **`injectStyles: true` injects everything**: the stylesheet with all 20 font faces
   rewritten to base64 `data:` URIs, which resolve identically everywhere.

Only the `.woff2` sources are inlined. KaTeX lists woff2, woff and ttf per face; keeping
all three would have made the module 1.6 MB instead of 359 KB, for browsers that have
supported woff2 since 2016.

The generated module is reached through a **dynamic `import()`** so tsup splits it into its
own chunk and the default path never loads it. Verified in `dist/`: it lands in
`katex-styles.generated-*.js` (368 KB) and `katex-styles.generated-*.cjs` (360 KB), leaving
`dist/plugins/math.js` at 322 bytes — the split holds on **both** formats, which was not a
given.

## Affected areas

- `packages/draftly/scripts/generate-katex-styles.ts` — replaces `generate-katex-css.ts`;
  now rewrites the `src` lists as well as stringifying the CSS, and throws if any relative
  font URL survives
- `packages/draftly/src/plugins/katex-styles.generated.ts` — replaces
  `katex-css.generated.ts`; 359 KB
- `packages/draftly/src/plugins/math-plugin.ts` — `injectStyles` option; injection moves
  from `renderMath` to the constructor and becomes asynchronous
- `packages/draftly/package.json` — `katex` dependency → optional peer; script renamed
- `packages/draftly/tsup.config.ts` — `katex` external
- `apps/web` — takes `katex` directly and imports its stylesheet, modelling the default path
- `README.md`, `packages/draftly/README.md`, `artifacts/architecture/plugins-catalog.md`,
  `artifacts/memory.md`

## Acceptance

- [x] No relative `url(fonts/…)` survives in the generated module — the generator throws
      otherwise
- [x] All 20 `@font-face` rules carry a `data:font/woff2` source
- [x] `katex` absent from `dependencies`, present in `peerDependencies` as optional and in
      tsup `external`
- [x] `bun run typecheck` clean
- [x] `bun run lint` clean (pre-existing Q7 warnings only)
- [x] Major changeset added
- [ ] **Playground checklist — not run.** Needs a browser: that math renders in KaTeX's own
      faces with the plugin's default `injectStyles: false` plus the app's CSS import, and
      that `injectStyles: true` produces the same result with the import removed.

## Notes

- `injectStyles` is read in the constructor rather than in `renderMath`, which is called
  from `toDOM` and from `renderToHTML`. Those are module-level functions with no access to
  plugin options, and threading options through both would have meant plumbing for a
  once-per-document side effect. Constructing the plugin is also the earliest possible
  moment, which matters because the import is async.
- The in-flight flag (`katexStylesRequested`) is module-scoped on purpose. The target is
  `document.head`, shared by every editor on the page, so "has this been injected" is a
  per-document question, not a per-plugin one. It resets on failure so a transient error
  can be retried.
