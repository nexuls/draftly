# Theming

> Last verified: 2026-08-18 · commit `eae4434`
> Source: `packages/draftly/src/editor/utils.ts`, `editor/theme.ts`,
> `editor/plugin.ts` (`getPreviewStyles` / `transformToCss`)

One style definition per plugin, consumed by two very different rendering surfaces.

---

## The model

A plugin's `theme` getter returns a **function**, not an object:

```ts
get theme(): (theme: ThemeEnum) => ThemeStyle
```

`createTheme()` builds that function from up to three style layers:

```ts
const theme = createTheme({
  default: { ".cm-draftly-h1": { fontSize: "2em", fontWeight: "bold" } },
  dark: { ".cm-draftly-h1": { color: "#e6e6e6" } },
  light: { ".cm-draftly-h1": { color: "#1a1a1a" } },
});
```

Resolution:

| `ThemeEnum` | Result                      |
| ----------- | --------------------------- |
| `DARK`      | `deepMerge(default, dark)`  |
| `LIGHT`     | `deepMerge(default, light)` |
| `AUTO`      | `default` only              |

> **`AUTO` does not detect the system theme.** It applies the `default` layer and nothing
> else. Plugins that want system-responsive styling must put `@media (prefers-color-scheme: dark)`
> selectors inside the `default` layer themselves. The enum name promises more than the
> implementation delivers — do not assume otherwise when reading plugin code.

Theme resolution happens **once, at composition time** in `draftly()`. Changing themes at
runtime requires reconstructing the extension bundle (which is what the playground does
via `next-themes` + a new `draftly()` call).

---

## Nested selectors

`flattenThemeStyles()` lets plugins write nested, SCSS-like style objects:

```ts
{
  ".cm-draftly-table": {
    borderCollapse: "collapse",
    ".cm-draftly-table-cell": { padding: "0.5em" },      // → ".cm-draftly-table .cm-draftly-table-cell"
    "&:hover": { background: "#f5f5f5" },                 // → ".cm-draftly-table:hover"
  }
}
```

Two behaviours to know:

- **Comma-separated selectors are split and expanded.** `"a, b": { c: {...} }` produces
  rules for both `a c` and `b c`. Added in `1ad0f3d`.
- **`&` is handled by `fixSelector()`**, which strips the whitespace before an `&`
  (`/\s&/g → ""`). So `"&:hover"` nested under `.x` becomes `.x:hover`, not `.x :hover`.
  A bare `&` mid-selector without leading whitespace is **not** rewritten — write
  `"& .child"` for descendants and `"&:state"` for states, and nothing else.

Output is a flat `Record<selector, StyleSpec>` ready for `style-mod`.

---

## The two consumers

### Editor — `EditorView.theme()`

```ts
// draftly.ts:136
const theme = plugin.theme;
if (baseStyles && theme && typeof theme === "function") {
  pluginExtensions.push(EditorView.theme(theme(configTheme)));
}
```

CodeMirror scopes these rules to the editor instance automatically and injects them as a
stylesheet. Gated on `baseStyles` — `baseStyles: false` means a consumer supplies all
styling themselves.

### Preview — scoped CSS text

```ts
// plugin.ts:240
protected transformToCss(themeStyles: ThemeStyle, wrapperClass: string): string {
  const styleMod = new StyleModule(themeStyles, {
    finish: (sel) => `.${wrapperClass} ${sel}`,
  });
  return styleMod.getRules();
}
```

The same style object, re-prefixed with the preview wrapper class and returned as a CSS
string for the consumer to inject in a `<style>` tag.

**Parity holds only because both surfaces emit the same class names.** The mechanism that
enforces it is plugins reading class names off their decoration specs in `renderToHTML`:

```ts
const headingClass = headingMarkDecorations["heading-1"].spec.class;
return `<h1 class="${headingClass}">${children}</h1>`;
```

Never hardcode a class name in `renderToHTML` that is also written in a `Decoration`.

---

## Base editor theme

`editor/theme.ts` exports two extensions.

### `draftlyBaseTheme`

Layout only, entirely scoped under `&.cm-draftly` so raw mode (`disableViewPlugin: true`)
inherits none of it:

- `.cm-draftly` — 16px / 1.6 line-height, transparent background (`!important`, so a
  CodeMirror theme cannot paint over the host page)
- `.cm-content` — `max-width: 48rem`, centred, `var(--font-sans)`
- `.cm-line` — `paddingInline: 0`
- `.cm-widgetBuffer` — `display: none !important` (hides CodeMirror's zero-width spacer
  elements, which otherwise create visible gaps around block widgets)

### `markdownResetExtension`

```ts
HighlightStyle.define([
  {
    tag: [
      t.heading,
      t.strong,
      t.emphasis,
      t.strikethrough,
      t.link,
      t.url,
      t.quote,
      t.list,
      t.meta,
      t.contentSeparator,
      t.labelName,
    ],
    color: "inherit",
    fontWeight: "inherit",
    fontStyle: "inherit",
    textDecoration: "none",
  },
]);
```

Registered as `Prec.highest(...)` in `draftly()`. Its job is to **neutralise third-party
CodeMirror themes**: a theme like `githubDark` colours markdown syntax as _code_, which
fights Draftly's goal of making markdown look like a document. This strips those opinions
so plugin decorations are the only thing styling markdown constructs.

`{ fallback: false }` means it does not act as a fallback highlighter — it only overrides.

---

## Adding styles

| Situation                                             | Where it goes                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Styling a markdown construct                          | The owning plugin's `createTheme()` block, at the bottom of the plugin file         |
| Plugin theme dominates the file (> ~200 LOC of style) | Split to `<plugin>-plugin.theme.ts` (see `code-plugin.theme.ts`)                    |
| Editor layout, applies to everything                  | `draftlyBaseTheme` in `editor/theme.ts`                                             |
| Preview-only structural style                         | `baseStyles` in `preview/css-generator.ts`                                          |
| Code token colours                                    | Not here — supply a `syntaxTheme`; see [preview-pipeline.md](./preview-pipeline.md) |

### Conventions

- Class names are `cm-draftly-<feature>[-<part>]`, e.g. `cm-draftly-table-cell`.
  Line decorations use `cm-draftly-line-<feature>`.
- Prefer `em` over `px` for anything that should scale with the container.
- Put colours in the `dark`/`light` layers; put structure in `default`.
- Avoid `!important` — the two existing uses (`background`, `widgetBuffer`) are
  deliberate overrides of CodeMirror's own rules and should stay the only ones.
