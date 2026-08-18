# C-009 — Harden `createTheme` and `deepMerge`

**Status:** Complete
**Priority:** Low
**Created:** 2026-08-18
**Completed:** 2026-08-18

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

- [x] `createTheme`'s returned function does not mutate anything
- [x] Calling it repeatedly with different `ThemeEnum` values returns correct, independent
      results
- [x] Theme output byte-identical to current for all 14 plugins, both themes — with one
      deliberate exception, see Outcome
- [x] `deepMerge` ignores inherited and dangerous keys
- [x] Nested and comma-separated selectors (C-004) still resolve correctly

## Outcome

Landed as `refactor(draftly): Make createTheme pure and harden deepMerge`.

**What changed in `editor/utils.ts`:**

1. `createTheme` flattens `default`, `dark` and `light` **once at construction**, into
   three `const`s. The returned resolver now only picks and merges. No parameter
   reassignment, no re-flattening per call.
2. `deepMerge` gained an `Object.hasOwn` filter and a `UNSAFE_MERGE_KEYS` skip list
   (`__proto__`, `constructor`, `prototype`), plus JSDoc stating the non-mutation
   contract that `createTheme` now depends on explicitly.
3. `flattenThemeStyles` and `fixSelector` gained the JSDoc they were missing.

**The one output change.** `flattenThemeStyles` split comma-separated keys without
trimming, so `".b, .c"` produced a selector key of `" .c"` — with a leading space that
survived into the emitted CSS. Now `.trim()`-ed. The rendered CSS is semantically
identical (a leading descendant combinator against the style-mod prefix), so this is a
cleanup rather than a behaviour change, but it does mean output is not byte-identical.

**Verified:** `tsc --noEmit` clean; a scratch harness confirmed AUTO/DARK/LIGHT resolution
is stable across repeated calls on one resolver, and that `deepMerge` with a
`JSON.parse('{"__proto__":{...}}')` overlay leaves `Object.prototype` untouched.

**Not done — deliberately:**

- Proposal item 4, narrowing or removing the `deepMerge` export, is a public API change.
  Per the boundaries rule it is flagged rather than taken; `deepMerge` is still exported
  from `editor/index.ts`.
- Proposal item 5, `fixSelector`: confirmed correct as written rather than changed.
  `flattenThemeStyles` always joins with a space before recursing, so the ` &` form is the
  only one that can reach it. Documented in its new JSDoc.

## Notes

- Byte-identical theme output is the acceptance test that matters. Capture `generateCSS()`
  output for all plugins in both themes before starting and diff after.
- Pure, CodeMirror-free, and already isolated — a natural first test target under T-001,
  alongside the table text utilities.
- Pairs naturally with T-019, which caches what this function computes. Doing this one
  first makes the caching obviously safe.
