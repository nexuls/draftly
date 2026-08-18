# Theming

> Last verified: 2026-08-18 · commit `5b9fac7`
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

`createTheme` flattens all three layers **eagerly, at construction time**. The function it
returns is pure — it selects a layer and merges, and mutates nothing. `deepMerge`'s
non-mutation contract is what makes that safe, so it is documented on `deepMerge` itself
rather than assumed.

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

- **Comma-separated selectors are split, trimmed, and expanded.** `"a, b": { c: {...} }`
  produces rules for both `a c` and `b c`. Added in `1ad0f3d`; the trim came with C-009,
  which removed a leading space from every selector after the first.
- **`&` is handled by `fixSelector()`**, which strips the whitespace before an `&`
  (`/\s&/g → ""`). So `"&:hover"` nested under `.x` becomes `.x:hover`, not `.x :hover`.
  A bare `&` mid-selector without leading whitespace is **not** rewritten — write
  `"& .child"` for descendants and `"&:state"` for states, and nothing else.

Output is a flat `Record<selector, StyleSpec>` ready for `style-mod`.

---

## The two consumers

### Editor — `EditorView.theme()`

```ts
// draftly.ts:138
if (baseStyles) {
  pluginExtensions.push(pluginThemeExtension(plugin, configTheme));
}
```

CodeMirror scopes these rules to the editor instance automatically and injects them as a
stylesheet. Gated on `baseStyles` — `baseStyles: false` means a consumer supplies all
styling themselves.

**Both the resolved styles and the extension are memoized**, in `editor/theme-cache.ts`,
by a `WeakMap` keyed on the plugin instance. This matters more than it looks:
`EditorView.theme()` mints a new `StyleModule`, and style-mod deduplicates injected rules
by module *identity* — so a fresh module per `draftly()` call appends a fresh copy of
every rule to `document.head`. A host that rebuilds its extension array (the playground
does, on every devbar toggle) would otherwise grow the stylesheet without bound.

The consequence for plugin authors: **a `theme` override must return a module-level
constant**, not a fresh `createTheme(...)` per access. All 14 built-ins already do, and
the base class default does now too.

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

## Design tokens

Every colour, font and shadow a plugin draws with resolves through a `--draftly-*` custom
property declared on the surface root. **No plugin should contain a literal colour.** The
one remaining exception is KaTeX's `errorColor`, which is a JavaScript render option rather
than CSS, so a `var()` would not resolve.

Each token reads a host variable before falling back to its own value:

```ts
"--draftly-color-link": "var(--color-primary, #0366d6)",
```

That is the whole theming contract. A host that already publishes `--color-primary`,
`--color-border`, `--font-sans` and friends themes Draftly by defining nothing; a bare page
gets the fallbacks.

Two properties follow from it that are easy to lose:

1. **Dark mode is only a token restatement.** `darkTokens` lists the tokens whose value
   changes and nothing else. Before this existed, six plugins carried full `dark` layers
   restating every rule, and four of `code-plugin.theme.ts`'s overrides were written at
   lower specificity than the rules they meant to override — so they silently never
   applied. A per-plugin `dark` layer is now a smell: ask whether the token is missing.
2. **The tokens must reach both surfaces.** They are declared in `resolveBaseStyles()`, and
   `generateCSS()` emits it for the preview. A plugin style using a token in preview while
   `includeBase: false` is set will fall through to nothing.

### Token groups

| Group                     | Examples                                                                | For                                       |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| `--draftly-font-*`        | `sans`, `mono`                                                          | Typography                                |
| `--draftly-color-*`       | `text`, `muted`, `link`, `link-hover`, `success`, `danger`, `border`    | Foreground and structural colour           |
| `--draftly-color-surface*`| `surface`, `surface-raised`                                             | Opaque backgrounds                        |
| `--draftly-surface-*`     | `header`, `stripe`, `hover`, `code`, `code-inline`, `code-header`       | Translucent tints over the page background |
| `--draftly-tint-1/2`      | —                                                                       | Generic tints, for chrome with no role     |
| `--draftly-color-add/del/mark*` | `-text`, `-line`, `-word`                                         | Diff and highlight accents                 |

Prefer a named surface role over a generic tint. The tint scale is small on purpose: almost
every component turned out to need light and dark values that are *not* symmetric, so a
numeric scale could not express them.

---

## Base editor theme

`editor/theme.ts` exports the base theme and the markdown reset.

### `draftlyBaseTheme(theme)`

A **function of `ThemeEnum`**, not a prebuilt extension — it carries the token block, which
is theme-dependent. Memoized per theme for the same reason plugin themes are: a fresh
`EditorView.theme()` mints a new `StyleModule`, and style-mod deduplicates by module
identity, so an unmemoized call appends another copy of every rule to `document.head`.

It is assembled from two halves:

- **`resolveBaseStyles(theme)`** — the surface-agnostic half, exported because
  `generateCSS()` re-emits it for the preview. `&` is the surface root and `.cm-content`
  the document container; the preview wrapper plays both roles, so both collapse onto it.
  This is what stops preview and editor typography from drifting.
  - `.cm-draftly` — 16px / 1.6 line-height, transparent background (`!important`, so a
    CodeMirror theme cannot paint over the host page), plus the token block
  - `.cm-content` — `max-width: 48rem`, centred, `var(--draftly-font-sans)`
- **editor-only rules** — things with no preview counterpart, kept out so the preview does
  not carry dead selectors:
  - `.cm-line` — `paddingInline: 0`
  - `.cm-widgetBuffer` — `display: none !important` (hides CodeMirror's zero-width spacer
    elements, which otherwise create visible gaps around block widgets)
  - `.cm-focused` — `outline: none`

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
| Editor layout, applies to everything                  | editor-only styles in `editor/theme.ts`                                             |
| Layout that both surfaces need                        | `draftlyBaseStyles` in `editor/theme.ts` — the preview re-emits it                  |
| A colour, font or shadow                              | A `--draftly-*` token in `editor/theme.ts`; reference it from the plugin            |
| Code token colours                                    | Not here — supply a `syntaxTheme`; see [preview-pipeline.md](./preview-pipeline.md) |

### Conventions

- Class names are `cm-draftly-<feature>[-<part>]`, e.g. `cm-draftly-table-cell`.
  Line decorations use `cm-draftly-line-<feature>`.
- Prefer `em` over `px` for anything that should scale with the container.
- **Never write a literal colour in a plugin.** Add or reuse a `--draftly-*` token.
- A `dark` layer in a plugin means a token is missing. Restate the token, not the rule —
  and check specificity if you must, because a dark override written below a more specific
  default rule will never apply.
- A class emitted by `renderToHTML` must not be a class the editor uses for *line* layout.
  `ListPlugin` shipped that bug: preview lists inherited `display: flex` and an
  `!important` padding computed from a per-line custom property the preview never sets.
- Avoid `!important` — the two existing uses (`background`, `widgetBuffer`) are
  deliberate overrides of CodeMirror's own rules and should stay the only ones.
