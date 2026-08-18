# T-026 — `ThemeEnum.AUTO` does not detect the system theme

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** Developer decision — behaviour change on a public enum

## Problem

`editor/utils.ts:68-78`:

```ts
let style: ThemeStyle = defaultTheme;
if (theme === ThemeEnum.DARK)  style = deepMerge(style, darkTheme);
if (theme === ThemeEnum.LIGHT) style = deepMerge(style, lightTheme);
return style;
```

`AUTO` matches neither branch, so it applies the `default` layer alone — never the dark or
light layer. It is the **default value** for `DraftlyConfig.theme` (`draftly.ts:92`) and
for `PreviewConfig.theme` (`preview.ts:31`), so it is what every consumer gets unless they
opt out.

The name promises system-theme detection. `createTheme`'s own JSDoc promises it explicitly
(`utils.ts:46-47`): *"Applied when theme is 'dark' or 'auto' and system is dark"*. Neither
is true. `matchMedia` appears nowhere in the library.

This is already logged as a known trap in `artifacts/memory.md`, described as "the name
over-promises". It is worth more than a memory note: consumers who never set `theme`
silently get a themeless editor and have no reason to suspect the option is the cause.

## Proposed approach

Two coherent options; the developer picks. Both are behaviour changes for anyone relying
on today's default.

**Option A — implement detection.**
- Editor: read `window.matchMedia("(prefers-color-scheme: dark)")` and resolve `AUTO` to
  `DARK` or `LIGHT`. Subscribe to `change` so the editor follows a live system switch —
  which needs T-024's `draftlyThemeFacet` wired up, or a full reconfigure.
- Preview: `generateCSS()` produces a static stylesheet with no runtime, so detection there
  must be a CSS `@media (prefers-color-scheme: dark)` block emitting **both** layers rather
  than picking one. That is the right output for static rendering anyway, and arguably
  makes `AUTO` more useful in preview than either explicit value.
- SSR: no `window`. Fall back to emitting both layers under a media query, same as preview.

**Option B — rename it honestly.** If `AUTO` is meant to be "base styles only, consumer
handles theming", call it `DEFAULT` or `NONE` and fix the JSDoc. Cheaper, non-breaking in
behaviour, breaking in name.

*Recommendation: A, with the media-query approach for preview and SSR.* It is what the name
and the docs already claim, and the preview half is genuinely better output. But it changes
what every existing consumer sees, so it needs the developer's call and probably a major.

Either way, fix the `createTheme` JSDoc — it currently documents behaviour that has never
existed, which is how this trap survives rediscovery.

## Affected areas

- `editor/utils.ts` — `createTheme` resolution and its JSDoc
- `editor/draftly.ts` — subscription to system changes, if Option A
- `editor/view-plugin.ts` — `draftlyThemeFacet` (see T-024) for live switching
- `preview/css-generator.ts` — media-query output
- `README.md` — the theme option's documented behaviour
- `artifacts/memory.md` — remove the trap once resolved
- `.changeset/` — behaviour change

## Acceptance

- [ ] `AUTO` in a browser applies the layer matching the system preference
- [ ] Changing the OS theme updates a live editor without a reload (Option A)
- [ ] `generateCSS()` with `AUTO` emits both layers under a media query
- [ ] SSR output with `AUTO` is theme-correct once hydrated
- [ ] Explicit `DARK` and `LIGHT` are unaffected
- [ ] `createTheme`'s JSDoc matches actual behaviour

## Notes

- The playground currently sidesteps this by resolving `system` itself before calling
  `draftly()` (`apps/web/app/playground/page.tsx:299-300`, and again at `:325`). That
  workaround is evidence the gap is real and that consumers hit it — and it is duplicated
  three times in one file, which is what working around a library gap looks like.
- Once fixed, simplify the playground to just pass `AUTO`. That is the acceptance test.
