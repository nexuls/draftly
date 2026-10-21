# draftly

## 3.0.0

### Major Changes

- f4a308e: Plugin keybindings now carry their own documentation, so a host can render a shortcut
  reference without hardcoding one.

  `DraftlyPlugin.getKeymap()` returns `DescribedKeyBinding[]` — a `KeyBinding` plus a required
  `name` and `description`, and an optional `context` for bindings that only apply somewhere
  specific. New `collectShortcuts(plugins)` gathers them across a plugin set.

  `TablePlugin`'s fifteen shortcuts are documented for the first time. They register through a
  precedence-wrapped extension rather than `getKeymap()`, so they are surfaced via the new
  `getShortcuts()` hook and labelled `"Inside a table"` — they rebind `Tab`, `Enter` and the
  arrow keys, which means listing them unqualified would be misleading.

  **Breaking:** `name` and `description` are required, so a plugin overriding `getKeymap()`
  with plain `KeyBinding`s no longer typechecks. Add the two fields; nothing about runtime
  behaviour changes.

- beb1a61: Introduce a semantic design-token layer. Colours, fonts and shadows are declared once as
  `--draftly-*` custom properties on the editor root (and the preview wrapper), and every
  plugin draws through them instead of hardcoding hex values.

  Two consequences worth knowing about:
  - **Theming is now a dozen custom properties**, not dozens of selector overrides. Each token
    also reads a host variable first — `var(--color-primary, #0366d6)` — so draftly picks up a
    design system that already publishes `--color-*`, `--font-sans` and friends with no
    configuration, and still renders correctly on a bare page.
  - **Dark mode is no longer a second copy of every colour rule.** Only tokens whose value
    changes are restated, so the six plugins that carried full `dark` theme layers no longer
    need them.

  **Breaking:** `draftlyBaseTheme` is now a function of `ThemeEnum` rather than a prebuilt
  extension, because the token block it emits is theme-dependent. Callers assembling
  extensions by hand should call `draftlyBaseTheme(theme)`. Nothing changes for users of
  `draftly()` or `generateCSS()`.

  Colour values are unchanged in both themes.

- cafc3cc: Move the three plugins with heavy dependencies behind their own entry points.

  `MermaidPlugin`, `MathPlugin` and `EmojiPlugin` are no longer exported from `draftly` or
  `draftly/plugins`. `createAllPlugins()` and the deprecated `allPlugins` array have moved to
  `draftly/plugins/all`.

  This was not a cosmetic distinction. tsup concatenates everything reachable from an entry
  point into a single chunk, and that chunk's top-level `import mermaid from "mermaid"` is
  evaluated whenever _any_ binding in it is used. So `import { HeadingPlugin } from
"draftly/plugins"` — one small plugin — pulled mermaid, KaTeX and node-emoji, and bundled
  to 8.0 MB. It now bundles to 2.5 MB, with none of the three present. Tree-shaking could not
  help: these are third-party packages a bundler cannot prove side-effect-free, and CJS
  consumers had no tree-shaking at all.

  | Entry point               | Plugin          | Dependency   | Approx. bundled cost |
  | ------------------------- | --------------- | ------------ | -------------------- |
  | `draftly/plugins/mermaid` | `MermaidPlugin` | `mermaid`    | 5.3 MB               |
  | `draftly/plugins/math`    | `MathPlugin`    | `katex`      | 475 KB               |
  | `draftly/plugins/emoji`   | `EmojiPlugin`   | `node-emoji` | 312 KB               |

  ## Migration

  If you used `allPlugins` or `createAllPlugins()`, change the import path — nothing else:

  ```diff
  - import { createAllPlugins } from "draftly/plugins";
  + import { createAllPlugins } from "draftly/plugins/all";
  ```

  If you imported a heavy plugin by name, take it from its entry point:

  ```diff
  - import { MathPlugin, HeadingPlugin } from "draftly/plugins";
  + import { HeadingPlugin } from "draftly/plugins";
  + import { MathPlugin } from "draftly/plugins/math";
  ```

  If you used `createEssentialPlugins()` and relied on it including math, mermaid or emoji,
  it no longer does — that is the point of the change. Add what you want:

  ```ts
  import { createEssentialPlugins } from "draftly/plugins";
  import { MathPlugin } from "draftly/plugins/math";

  draftly({ plugins: [...createEssentialPlugins(), new MathPlugin()] });
  ```

  Nothing about a plugin's behaviour changed; only where you import it from.

- 78dcf5d: `katex` is now an optional peer dependency, and `MathPlugin` no longer injects CSS by default.

  **Install `katex` yourself** if you use `MathPlugin`. It is no longer bundled into `dist/`,
  so you get exactly one copy of it rather than Draftly's plus your own.

  **Bring the stylesheet too.** Previously `MathPlugin` injected KaTeX's CSS into the document
  head automatically — but that CSS references its fonts with relative `fonts/KaTeX_*` paths,
  which a `<style>` element resolves against _your page URL_, so the fonts have never actually
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

- 3b3f990: Fix nested list indentation in the preview.

  Rendered lists were emitted with the editor's _line_ classes
  (`cm-draftly-list-line-ul`), which carry `display: flex` and a
  `padding-left: calc(1rem * (var(--depth, 0) + 1)) !important` computed from a custom
  property the editor sets per line. In static HTML nothing sets `--depth`, so every list —
  top level or five deep — got the same `1rem`, and the `!important` meant the preview's own
  `padding-left` could not override it.

  Preview lists now use their own classes (`cm-draftly-list`, plus `-ul`/`-ol`) and indent
  from the nested element's own padding, which is what nesting means in HTML.

  **Breaking:** rendered `<ul>`/`<ol>` elements no longer carry `cm-draftly-list-line-ul`,
  `cm-draftly-list-line-ol` or `cm-draftly-preview`. Restyle against `cm-draftly-list` if you
  were targeting the old names.

- 2dcfed0: Remove the deprecated `essentialPlugins` and `allPlugins` arrays.

  Both were pre-constructed module-level arrays of plugin instances shared by every importer.
  Because a plugin instance holds per-editor state (`_config`, `_context`, and `TablePlugin`'s
  deferred-work locks), two editors on one page overwrote each other's configuration and
  cancelled each other's table normalization. C-026 added factories and deprecated the arrays
  for one cycle; that cycle is over.

  Replace each with the factory that builds a fresh set, **once per editor**:

  ```diff
  - import { essentialPlugins } from "draftly/plugins";
  - draftly({ plugins: essentialPlugins })
  + import { createEssentialPlugins } from "draftly/plugins";
  + draftly({ plugins: createEssentialPlugins() })
  ```

  ```diff
  - import { allPlugins } from "draftly/plugins/all";
  - draftly({ plugins: allPlugins })
  + import { createAllPlugins } from "draftly/plugins/all";
  + draftly({ plugins: createAllPlugins() })
  ```

### Minor Changes

- 48e6c53: Keep a fenced code block's header and caption visible while the cursor is inside the block.
  They previously disappeared on entry, so clicking into a block shifted every line under the
  cursor. The ``` fences still reveal themselves, but now only when the cursor is on a fence
  line rather than anywhere in the block.
- 5b9fac7: `MathPlugin` accepts a LaTeX parser to overlay on math content, so the raw source
  highlights while the cursor is inside a formula.

  ```ts
  import { latexLanguage } from "codemirror-lang-latex";
  import { styleTags } from "@lezer/highlight";
  import { MathPlugin, latexHighlightTags } from "draftly/plugins";

  new MathPlugin({
    mathParser: latexLanguage.parser.configure({
      props: [styleTags(latexHighlightTags)],
    }),
  });
  ```

  The parser is injected rather than bundled. `codemirror-lang-latex` is AGPL-3.0-or-later
  and draftly is MIT, so depending on it would push those terms onto every consumer — this
  way the choice stays with the application that wants the feature, and draftly's dependency
  list and bundle are unchanged.

  `latexHighlightTags` covers the ~40 control-sequence node types that package specialises but
  does not style, which otherwise render as plain text next to the generic `CtrlSeq` token.

- f5393f0: Scope decoration building to the viewport.

  No plugin bounded its syntax-tree walk, so every editor update cost O(document) — and
  because decorations rebuild on selection changes too, **moving the cursor one character
  cost the same as editing**, across all 14 plugins.

  `DecorationContext` gains `visibleRanges` and `iterateVisible()`. Plugins call
  `ctx.iterateVisible({ enter })` instead of `syntaxTree(view.state).iterate({ enter })`;
  the bounds come from the core, so a new plugin cannot repeat the mistake by omission.

  On a 5,000-line document, building decorations for all plugins goes from 39.2 ms to
  0.40 ms.

  **For plugin authors:** this is the new required idiom. `ctx.iterateVisible` yields nodes
  that _overlap_ the viewport, so constructs straddling the edge are still decorated in full,
  and a node spanning a gap between two visible ranges is entered only once.

- 27fdb24: Make rendered widgets reachable and announceable.

  **Task lists can now be toggled without a mouse.** `Mod-Enter` toggles every task on the
  selected lines. The rendered checkbox was `aria-hidden` with `tabIndex = -1`, so an
  interactive control that mutates the document was invisible to assistive technology and
  unreachable by keyboard — a keyboard user could only edit the raw `[ ]` text, which
  `aria-hidden` prevented them from knowing was there. It is now announced as
  "Task complete" / "Task incomplete", and the keybinding is the interface.

  **Link URLs are discoverable without hovering.** Both link widgets carry the URL and the
  otherwise-invisible "Ctrl+Click to open" affordance in a native `title`, which is announced
  by screen readers and surfaces on long-press.

  **Mermaid diagrams get a text alternative** derived from the diagram source; images fall
  back to their alt text for the figure's accessible name; math and mermaid error states are
  announced as alerts.

  KaTeX already emits MathML beside its visual output, so formulas were readable — no
  `aria-label` was added there, which would have replaced the MathML with a flat string.

- 7efa83a: Give paragraphs the same spacing in the editor as in the preview. `ParagraphPlugin`
  previously only had a `renderToHTML`, so its padding existed on one surface only.

  The padding is split across the paragraph's first and last line rather than applied to
  every line, since a paragraph's markdown source can span several lines and a per-line class
  carrying both edges would open a gap between each of them.

- fa72daf: Add `createEssentialPlugins()` and `createAllPlugins()`; deprecate the `essentialPlugins`
  and `allPlugins` arrays.

  `essentialPlugins` and `allPlugins` were pre-constructed module-level arrays holding the
  same instances, so every consumer of the library shared one set of plugin objects. Those
  objects carry per-editor state — `_context` on the base class, and `TablePlugin`'s
  `draftlyConfig` plus its three deferred-work re-entrancy locks. With two editors on one
  page (a split view, a modal, a docs site with several examples) that state cross-talks:
  - the second `draftly()` call's `onRegister` overwrites the first's context, so editor A
    renders with editor B's configuration;
  - `scheduleNormalization` compares against a single `pendingNormalizationView` field, so
    B's scheduled work overwrites A's and A's queued microtask silently returns — table
    normalization is cancelled in editor A with no error.

  The factories build a fresh set per call, which fixes both. Use one set per editor:

  ```diff
  - import { allPlugins } from "draftly/plugins";
  - draftly({ plugins: allPlugins })
  + import { createAllPlugins } from "draftly/plugins";
  + draftly({ plugins: createAllPlugins() })
  ```

  **Not breaking.** `essentialPlugins` and `allPlugins` are still exported and still behave
  exactly as before, including the shared-instance behaviour — upgrading the import is what
  fixes the cross-talk, not merely recompiling. They are marked `@deprecated` and will be
  removed in a future major.

  Single-editor usage is unaffected either way.

- 1f099a7: Surface genuine plugin errors instead of swallowing everything.

  `buildDecorations` failures were caught and discarded without a trace. The rationale is
  sound — Lezer exposes partially-built trees mid-parse and node access throws until it
  settles — but it meant a real plugin bug produced exactly the same symptom as the benign
  case: the decoration silently did not appear, with no log and no counter. Debugging meant
  editing library source.

  Errors raised while the syntax tree is still parsing are still swallowed. Everything else
  is reported **once per distinct plugin and message**, so a persistent bug does not flood
  the console as decorations rebuild on every cursor movement.

  New `DraftlyConfig.onPluginError?: (plugin, error) => void` routes them wherever you want.
  Without a handler, Draftly logs to `console.error` outside production and stays silent in
  production.

- 21992ea: Derive the preview's base CSS from the editor's base theme instead of a separate hardcoded
  rule, so the two surfaces cannot drift apart on typography, width or padding.

  `draftlyBaseStyles` is a new export holding the surface-agnostic half of the base theme;
  `generateCSS()` re-emits it against the configured `wrapperClass`. Editor-only rules that
  address CodeMirror internals (`.cm-line`, `.cm-widgetBuffer`, `.cm-focused`) stay out of it,
  so the preview no longer carries dead selectors.

  Preview output now inherits the editor's `max-width: 48rem`, centring and font stack. Pass
  `includeBase: false` to `generateCSS()` if your layout supplies its own.

  The editor also stops drawing a browser focus ring around the document; it already has a
  caret and selection styling of its own.

- c496c81: Add a teardown lifecycle.

  The library had no teardown path at all: no `destroy()` on the view plugin, no
  `onViewDestroy`, and `onUnregister` declared but never called. Since plugin instances are
  module-level singletons, anything a plugin held outlived every view — most concretely
  `TablePlugin`'s three pending-view fields, which retained a destroyed `EditorView` (and
  therefore its DOM, state and document) for the lifetime of the page if a repair microtask
  was in flight when the view went away. Hosts that rebuild their extension array on a
  config change destroy views routinely.

  `DraftlyPlugin` gains `onViewDestroy(view)`, symmetric with `onViewReady`, called from the
  view plugin's `destroy()`. **Plugins holding view-scoped state must release it there.**

  `TablePlugin` releases its pending views, and its queued microtasks now bail rather than
  dispatching into a destroyed editor.

  `onUnregister` is marked `@deprecated`: it cannot be wired up correctly while plugin
  instances are shared singletons. Use `onViewDestroy`.

### Patch Changes

- 67e58d3: Measure table column widths in display columns, not code units.

  `renderWidth()` padded cells by `String.length`, which misaligns the raw markdown for
  anything non-ASCII: a CJK glyph is one code unit and two columns, an emoji is two and two,
  a combining accent is one and zero, and a ZWJ family emoji is eight and two.

  New `displayWidth` in `draftly/lib` measures monospace columns using `Intl.Segmenter` for
  grapheme clustering and an inlined East Asian Width table — no new dependency. Pure ASCII
  measures exactly as before, so existing documents see no padding churn.

  Where `Intl.Segmenter` is unavailable, the fallback measures per code point: still correct
  for CJK, emoji and combining marks, and only slightly over-estimating ZWJ sequences. The
  browser support floor is unchanged.

  This only affects the raw markdown. The rendered table view was always correct — it is laid
  out with CSS, not padding.

- dfc53b8: Stop preview from emitting raw HTML for unhandled nodes.

  `HTMLPlugin` declared neither `requiredNodes` nor `renderToHTML`, and `requiredNodes` is
  the preview dispatch key — so `HTMLBlock` and `HTMLTag` nodes fell through to the
  renderer's leaf fallback, which returned document source **unescaped**.
  `<script>alert(1)</script>` written in a markdown document became a live script tag in
  preview output regardless of the `sanitize` setting, while the editor surface sanitized it
  correctly. Both halves are fixed:
  - The renderer's leaf fallback now escapes. It is a safety net, not a pass-through.
  - `HTMLPlugin` renders on the preview surface, honouring `sanitize`. Blocks go through
    DOMPurify directly; individual tags go through a balanced probe, because DOMPurify
    balances the fragment it is given and would otherwise turn `<b>` into `<b></b>` and
    swallow every `</b>`. HTML comments render as nothing.

  In development, a plugin that defines `renderToHTML()` but declares no `requiredNodes` now
  warns on the console instead of being silently absent from preview.

  Note this closes the client-side hole only. `sanitize()` still no-ops outside a browser.

- f66a43f: Make `import { draftly } from "draftly"` tree-shakeable.

  The barrel re-exports every plugin, and `math-plugin.ts` injected KaTeX's stylesheet at
  module scope while `mermaid-plugin.ts` called `mermaid.initialize()` at module scope. Those
  are genuine side effects, so no bundler could drop the modules — every consumer paid for
  mermaid (roughly a megabyte) and KaTeX whether or not they wrote a diagram or a formula.

  Both are now lazy: the stylesheet is injected on first render, and mermaid initializes
  behind a guard on first render. With the side effects gone, `packages/draftly` declares
  `"sideEffects": false` truthfully.

  Verified by bundling the published artefact rather than by inspection:
  `import { draftly }` now produces 6.2 KB with no reference to mermaid, katex or
  node-emoji. Before, the same bundle could not be produced at all.

  The unused `zod` dependency is dropped.

  Module-scope DOM mutation was also an SSR hazard — the KaTeX injection touched `document`
  during module evaluation.

- 63ca0a8: Fix `MathPlugin` being unbundlable from the published package.

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

- 25009d5: Resolve preview plugin conflicts by `decorationPriority`, matching the editor.

  The editor sorted plugins by `decorationPriority`; preview dispatched in whatever order the
  consumer passed them in. So two plugins claiming the same node — exactly what a consumer
  adding a plugin to override a built-in does — resolved differently on the two surfaces,
  undercutting the architecture's editor/preview parity guarantee.

  Preview now tries candidates in descending `decorationPriority` and takes the first
  non-null result, so a higher number wins on both surfaces. No built-in plugins share a
  `requiredNodes` entry, so built-in output is unchanged.

  Two plugins claiming the same node at the same priority now warn in development.

- 09bcb29: Reveal a list marker's raw syntax only when the cursor is on the marker, rather than
  anywhere on its line. Every bullet on a line used to un-style as soon as the caret entered
  that line's text.
- bf23f73: Fix three math block parsing bugs.
  - `$$x^2$$` on a single line was never recognised as a math block; only the fenced form
    with the delimiters on their own lines parsed. The single-line form is now claimed when
    it occupies the whole line, and deliberately left alone when other content follows it.
  - An indented `$$` — inside a list item or blockquote — produced an opening `MathBlockMark`
    covering the leading whitespace instead of the delimiter, because the fence was searched
    for from the start of the line rather than from the container prefix.
  - Trailing whitespace after the closing `$$` pushed the closing mark past the delimiter, so
    it covered the whitespace instead.

- 86ee956: `MermaidPlugin` now shares one render between widgets showing the same diagram.

  Two widgets with the same definition, attributes and theme — the editor and preview panes,
  a diagram repeated in a document, a widget rebuilt while its first render is still running
  — previously each started their own `mermaid.render()`. They now share the in-flight
  promise.

  This is de-duplication rather than caching: the entry is retracted as soon as the render
  settles, so an edited diagram is never served a stale SVG and a failed render is retried by
  the next caller.

- 7f86e56: Make server-side sanitization honest, and add `PreviewConfig.sanitizer`.

  `sanitize` is implemented with DOMPurify, which needs a DOM — so during SSR or static
  generation `sanitize: true` was a silent no-op while every signal told the consumer they
  were protected. It now warns once per process, naming the risk and the remedy.

  The remedy is the new `sanitizer` option: supply your own function (`isomorphic-dompurify`,
  or DOMPurify with jsdom) and Draftly uses it in preference to the bundled one, on every
  surface. Draftly still does not bundle jsdom.

  Pass-through when no sanitizer is supplied is unchanged, so existing setups keep working;
  only the silence is gone. The README now carries a warning call-out on the preview config
  table rather than leaving this to a source comment.

- aca5d80: Stop widgets from being rebuilt on every keystroke.

  Six widgets — image, both link widgets, inline math, block math and mermaid — compared
  document positions in `eq()`. `eq()` answers "can CodeMirror keep the DOM it already
  built?", and positions shift on any edit earlier in the document, so the answer was
  permanently no. Typing one character at the top of a file re-rendered every KaTeX formula
  and re-ran an async `mermaid.render()` for every diagram below it, and destroyed and
  re-created every `<img>`.

  They now compare content only. The click handlers resolve the construct's range from the
  live DOM at event time via the new `resolveWidgetRange()` in `draftly/lib` — which is also
  more correct than the old snapshot, since a snapshot taken at decoration-build time went
  stale the moment anything above it changed.

  `MermaidBlockWidget` also stops comparing its attributes with `JSON.stringify`, which was
  key-order dependent and allocated two strings per comparison.

- 928ae6c: Guard widget async work.
  - **Copy button:** `navigator.clipboard.writeText` had no `.catch()`. It rejects when
    permission is denied, when the document is not focused, and over plain HTTP — all of
    which a docs-site playground in an iframe hits routinely — so the failure was an
    unhandled rejection and a button that silently did nothing. It now shows a failure state.
    The 2-second reset timer is tracked, cancelled on widget teardown, and restarted rather
    than raced on a rapid second click.
  - **Mermaid:** the async render no longer writes into a detached element, and the error
    path uses `classList.add` instead of `className +=`. Error text is escaped. The
    module-level id counter wraps instead of growing for the page's lifetime.
  - **Images:** a broken image shows exactly one error message. `onerror` can fire more than
    once for the same element, which stacked duplicates.

- 02e81fb: Point the `repository` field at `github.com/nexuls/draftly`. The project moved
  organisations; the old `neuronexul` path no longer resolves.
- 38df166: Scope preview syntax-highlight CSS to the preview wrapper. `generateSyntaxThemeCSS()`
  accepted a `wrapperClass` but ignored it, so the bare `.tok-*` rules CodeMirror emits were
  written into the host page's global stylesheet and also restyled the editor. Rules are now
  prefixed with the configured wrapper class, with `@media`/`@supports` bodies scoped
  recursively and `@keyframes` left intact.
- b66967f: Remove redundant work from the preview renderer.

  Each node's children are now rendered **once**. They used to be re-rendered per candidate
  plugin and again for the default renderer, and since `renderNode` recurses, the
  duplication compounded with depth.

  The markdown parser is now cached across `preview()` calls rather than rebuilt per call —
  constructing it pulls in the whole `@codemirror/language-data` registry, which in a
  debounced live-preview setup happened on every keystroke.

  `escapeHtml` is a single pass instead of five chained `.replace` calls.

  Output is byte-identical: ~19% faster on the playground walkthrough document, ~14% on a
  table-heavy one.

- a3c03bc: Escape attribute values and reject dangerous URL schemes in preview output.

  `LinkPlugin` and `ImagePlugin` built their HTML attributes by interpolating
  `ctx.sanitize(value)` into a quoted attribute. DOMPurify sanitizes an HTML
  _fragment_; handed a bare string it returns it essentially unchanged, quotes
  included — so `[x](" onmouseover="alert(1))` injected an attribute, and
  `[x](javascript:alert(1))` emitted a live `javascript:` URL. Attribute values are
  now escaped with `escapeHtml`, and URLs pass a scheme allowlist.

  New in `draftly/lib`: `isSafeUrl`, `safeUrl` and `SafeUrlOptions`. `escapeHtml`
  also moved here; it is still re-exported from `draftly/preview`, so that import
  path is unchanged.

  The editor surface applies the same guard — an image `src` and a Ctrl+Click on a
  link now reject the schemes preview rejects. A link or image whose URL is
  rejected renders with an empty `href`/`src` rather than being dropped.

## 2.1.0

### Minor Changes

- 2f5339f: - Table Feature (Reimagined with BlockWrapper)
  - Comma separated parent selector for nested style
  - Plugin extensions added in disabled mode
  - Handle tailing line in table

## 2.0.0

### Major Changes

- 31791b8: Feat:
  - Added Table Plugin
  - feat/issue-1-surround-selected-text-with-inlint-styling
  - Extract syntax classes from codemirror theme for syntax highlighting
  - Added diff view in code block
  - Plugin Theme nested style
  - Emoji plugin

## 1.0.0

### Major Changes

- 17ee4e8: Added multiple plugins and fixes

### Minor Changes

- a20d730: Modularized into `editor`, `preview`, `plugin`.
  Added Bunch on plugins, Refactor.
  Preview Markdown
- ae19954: Initial Pre Release

## 1.0.0-alpha.2

### Major Changes

- 17ee4e8: Added multiple plugins and fixes

## 0.1.0-alpha.1

### Minor Changes

- a20d730: Modularized into `editor`, `preview`, `plugin`.
  Added Bunch on plugins, Refactor.
  Preview Markdown

## 0.1.0-alpha.0

### Minor Changes

- Initial Pre Release
