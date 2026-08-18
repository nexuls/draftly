# T-025 — Harden `createTheme` and `deepMerge`

**Status:** Proposed
**Priority:** Low
**Created:** 2026-08-18
**Blocked on:** —

## Problem

Two issues in `editor/utils.ts`, neither currently causing visible breakage, both the kind
that turns into a confusing bug the moment something nearby changes.

### `createTheme` reassigns its own closure parameters

`editor/utils.ts:63-67`:

```ts
return (theme: ThemeEnum) => {
  defaultTheme = flattenThemeStyles(defaultTheme);
  darkTheme = flattenThemeStyles(darkTheme || {});
  lightTheme = flattenThemeStyles(lightTheme || {});
  ...
```

The returned function mutates the variables it closes over, on every call. It is safe
*today* only because `deepMerge` happens not to mutate its first argument
(`utils.ts:11` — `const result = { ...a }`, and the recursive branch at `:19` also
allocates). Nothing states or enforces that invariant, and the function reads as though it
accumulates state across calls.

It also re-flattens the entire theme tree — default, dark, and light — on every
invocation. `plugin.theme` is called per plugin per `draftly()` call and again per
`generateCSS()` call, so this is not a one-off. T-019 covers the caching; this covers the
correctness hazard underneath it.

### `deepMerge` is prototype-pollution-shaped

`editor/utils.ts:16-24`:

```ts
for (const key in b as T) {
  ...
  result[key] = b[key];
}
```

No `hasOwnProperty` filter and no guard on `__proto__` / `constructor` / `prototype`.
Themes are developer-supplied so there is no realistic attack path today, but `deepMerge`
is a generic exported utility with a generic name — the next caller may not be a theme.

## Proposed approach

1. **Make `createTheme` pure.** Flatten once at construction time, outside the returned
   closure, into local `const`s. That is both correct and free — the flattening happens
   once per `createTheme` call rather than once per theme resolution.
2. **Document `deepMerge`'s non-mutation contract** in its JSDoc, since `createTheme`
   depends on it.
3. **Guard `deepMerge`** — filter with `Object.hasOwn(b, key)` and skip the three dangerous
   keys. Four lines.
4. **Consider whether `deepMerge` should be exported at all.** It is a generic utility
   serving one internal caller; if nothing outside the library needs it, narrowing the
   export surface is the better fix than hardening a general-purpose function.
5. **While in there:** `fixSelector` (`utils.ts:104`) replaces `/\s&/g` with the empty
   string, which handles `& .foo` but not a leading `&` with no preceding whitespace. Worth
   confirming against the nested-selector cases C-004 introduced before assuming it is
   correct — that task is recent and the two interact.

## Affected areas

- `editor/utils.ts` — `createTheme`, `deepMerge`, possibly `fixSelector`
- `editor/index.ts` — export surface if `deepMerge` is narrowed
- `artifacts/architecture/theming.md` (or equivalent) — the purity contract

## Acceptance

- [ ] `createTheme`'s returned function does not mutate anything
- [ ] Calling it repeatedly with different `ThemeEnum` values returns correct, independent
      results
- [ ] Theme output byte-identical to current for all 14 plugins, both themes
- [ ] `deepMerge` ignores inherited and dangerous keys
- [ ] Nested and comma-separated selectors (C-004) still resolve correctly

## Notes

- Byte-identical theme output is the acceptance test that matters. Capture `generateCSS()`
  output for all plugins in both themes before starting and diff after.
- Pure, CodeMirror-free, and already isolated — a natural first test target under T-001,
  alongside the table text utilities.
- Pairs naturally with T-019, which caches what this function computes. Doing this one
  first makes the caching obviously safe.
