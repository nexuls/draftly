# T-019 — Plugin themes rebuild on every reconfigure, growing the stylesheet

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** —

## Problem

`editor/draftly.ts:130-135` builds a theme extension per plugin, per `draftly()` call:

```ts
const theme = plugin.theme;
if (baseStyles && theme && typeof theme === "function") {
  pluginExtensions.push(EditorView.theme(theme(configTheme)));
}
```

`EditorView.theme()` creates a new `StyleModule`, and style-mod injects a module's rules
into `document.head` when a view mounts it. New module instance means new rules appended —
style-mod deduplicates by module identity, and a fresh instance is never identical to the
last one.

The playground rebuilds its extension array on every devbar toggle, theme switch, and mode
change (`apps/web/app/playground/page.tsx:296-321`), so the injected stylesheet grows
monotonically for the session: 14 plugins' worth of CSS re-injected per reconfigure.

The recomputation is wasteful too. Each `plugin.theme` access returns a **new function**
from `createTheme` (`editor/plugin.ts:82`, base class), and calling it re-runs
`flattenThemeStyles` over the whole theme tree (`editor/utils.ts:64-66`) — for the default
theme, the dark theme, and the light theme, every time. `generateCSS()` pays the same cost
independently (`preview/css-generator.ts:59`), on every playground preview render.

Plugin themes are static per `(plugin, theme)` pair. Nothing about them justifies
recomputation, let alone re-injection.

## Proposed approach

1. **Memoize the flattened theme per `(plugin, ThemeEnum)`.** A `Map` on the plugin
   instance, or a module-level `WeakMap<DraftlyPlugin, Map<ThemeEnum, ThemeStyle>>`.
   Three enum values means at most three entries per plugin.
2. **Memoize the `Extension` too**, not just the style object. That is what actually stops
   the stylesheet growing — reusing the same `StyleModule` instance lets style-mod
   deduplicate. Cache the `EditorView.theme(...)` result per `(plugin, theme, baseStyles)`.
3. **Make `theme` a stable property rather than a getter that allocates.** The base class
   getter (`plugin.ts:78-86`) constructs a fresh `createTheme(...)` closure on every access,
   which is a trap for anyone who assumes identity stability. Subclass overrides
   (`heading-plugin.ts:68` and the rest) return a module-level constant and are fine — the
   base class should match that shape.
4. **Fix `createTheme`'s parameter reassignment** while in there — see T-025; it is what
   makes the recomputation look idempotent-but-suspicious.

## Affected areas

- `editor/draftly.ts` — theme extension construction
- `editor/plugin.ts` — the `theme` getter, `getPreviewStyles`
- `editor/utils.ts` — `createTheme` memoization
- `preview/css-generator.ts` — reuse the same cache
- `artifacts/architecture/theming.md` (or the relevant architecture doc) — caching behaviour

## Acceptance

- [ ] Toggling devbar options 20 times does not grow the number of injected style rules
- [ ] `document.styleSheets` rule count is stable across reconfigures
- [ ] Theme switching still applies the correct light/dark layer
- [ ] `generateCSS()` output is unchanged
- [ ] Custom plugin themes supplied by consumers still work

## Notes

- Verify by reading `document.styleSheets` rule counts in the console before and after a
  batch of toggles. This is directly observable — no profiler needed.
- Interacts with T-017: if plugin instances become per-editor, a `WeakMap` keyed on the
  instance still works, but the cache hit rate drops. Keying the flattened-style cache on
  the plugin *class* rather than the instance sidesteps that.
