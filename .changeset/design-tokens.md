---
"draftly": major
---

Introduce a semantic design-token layer. Colours, fonts and shadows are declared once as
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
