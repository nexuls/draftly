---
"draftly": major
---

`katex` is now an optional peer dependency, and `MathPlugin` no longer injects CSS by default.

**Install `katex` yourself** if you use `MathPlugin`. It is no longer bundled into `dist/`,
so you get exactly one copy of it rather than Draftly's plus your own.

**Bring the stylesheet too.** Previously `MathPlugin` injected KaTeX's CSS into the document
head automatically — but that CSS references its fonts with relative `fonts/KaTeX_*` paths,
which a `<style>` element resolves against *your page URL*, so the fonts have never actually
loaded for anyone. Math has been rendering in a fallback face.

If you have a build step, import KaTeX's stylesheet and let your bundler handle the fonts:

```ts
import "katex/dist/katex.min.css";
```

If you do not — a `<script>` tag, a CDN, an embedded editor — ask the plugin for it:

```ts
new MathPlugin({ injectStyles: true });
```

That injects the stylesheet with all 20 font faces inlined as `data:` URIs, once per
document, at a cost of about 360 KB. It sits behind a dynamic `import()` and ships as its
own chunk, so leaving `injectStyles` at its default of `false` costs nothing.
