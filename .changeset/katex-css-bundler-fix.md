---
"draftly": patch
---

Fix `MathPlugin` being unbundlable from the published package.

`math-plugin.ts` imported KaTeX's stylesheet as a string with Vite's `?raw` suffix. The
`.css: "text"` esbuild loader in `tsup.config.ts` was meant to inline it, but never
applied — the specifier ends in `?raw`, not `.css`, so esbuild left the import statement
untouched. The published `dist/` therefore contained a literal
`import katexCss from 'katex/dist/katex.min.css?raw'`, and any consumer bundling
`MathPlugin` with a toolchain that does not implement Vite's `?raw` convention failed with
`Could not resolve: "katex/dist/katex.min.css?raw"`.

The stylesheet is now generated into an ordinary TypeScript module
(`src/plugins/katex-css.generated.ts`) by `bun run generate:katex-css`, so no
bundler-specific import syntax appears in the source or in `dist/`. No API change; nothing
to do on upgrade.
