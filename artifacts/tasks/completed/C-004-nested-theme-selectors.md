# C-004 — Nested and comma-separated theme selectors

**Status:** Complete
**Priority:** Medium
**Completed:** commits `f22824c`, `1ad0f3d`
**Reconstructed:** 2026-08-18 from git history — predates the artifact system.

## Problem

Plugin themes were flat `Record<selector, StyleSpec>` objects. Any nested relationship had
to be written as a fully-qualified selector string:

```ts
{
  ".cm-draftly-table": { borderCollapse: "collapse" },
  ".cm-draftly-table .cm-draftly-table-cell": { padding: "0.5em" },
  ".cm-draftly-table:hover": { background: "#f5f5f5" },
}
```

Verbose, repetitive, and error-prone as selector depth grew — a particular problem for the
table and code plugins, which have deeply structured DOM.

## Outcome

**`f22824c` — nested styles.** Added `flattenThemeStyles()` to `editor/utils.ts`. Plugin
themes can now nest SCSS-style:

```ts
{
  ".cm-draftly-table": {
    borderCollapse: "collapse",
    ".cm-draftly-table-cell": { padding: "0.5em" },   // → descendant
    "&:hover": { background: "#f5f5f5" },              // → same element
  }
}
```

`fixSelector()` handles `&` by stripping the whitespace before it (`/\s&/g → ""`), so
`"&:hover"` nested under `.x` resolves to `.x:hover` rather than `.x :hover`.

**`1ad0f3d` — comma-separated parents.** Extended the flattener to split comma-separated
selectors and expand each branch, so `{"a, b": { ".c": {...} }}` produces rules for both
`a .c` and `b .c`.

The flattener runs inside `createTheme()`, so the output is still a flat map by the time it
reaches `style-mod` — both consumers (`EditorView.theme` and `transformToCss`) were
unaffected.

## Durable consequences

- Only two `&` forms are supported: `"& .child"` for descendants and `"&:state"` for the
  same element. A bare `&` mid-selector with no leading whitespace is **not** rewritten.
- Documented in [`../../architecture/theming.md`](../../architecture/theming.md).
