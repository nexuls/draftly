# T-002 — Fix README ↔ API drift

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
**Blocked on:** Developer answers to memory Q1 and Q2

## Problem

The public README — which is the npm landing page and the first thing a new consumer
reads — documents an API that does not match the code. Two concrete defects:

1. **`themeStyle` does not exist.** The `DraftlyConfig` table documents
   `themeStyle: Extension` ("CodeMirror theme extension, e.g. `githubDark`"), and two
   code examples pass it. `DraftlyConfig` in `editor/draftly.ts:29` has no such field, so
   the option is silently ignored. A consumer following the README gets an unthemed
   editor and no error.

2. **`preview()` is shown as synchronous.** The README example is
   `const html = preview(markdown, {...})`, then renders `html` directly.
   `preview/preview.ts:24` returns `Promise<string>`, so this renders
   `[object Promise]`. The `PreviewConfig` table also omits `syntaxTheme`, which is the
   option that actually drives code syntax highlighting.

Both are reproducible by copy-pasting from the README, which makes them the highest-cost
documentation bugs in the project.

## Proposed approach

Blocked pending the developer's intent, because the fix differs by answer:

- **If `themeStyle` was intended and dropped** → implement it in `DraftlyConfig`
  (pass-through into the extension array) and keep the docs.
- **If it was removed deliberately** → delete it from the README and document how to
  supply a CodeMirror theme instead (pass it via `extensions`).

For the async issue there is no ambiguity in the code — the README should be corrected to
`const html = await preview(...)` — but confirm whether a sync path was ever intended
before rewriting the surrounding example.

Once resolved, audit the whole README against the source in one pass rather than patching
the two known spots:

- `DraftlyConfig` table vs `editor/draftly.ts`
- `PreviewConfig` table vs `preview/types.ts` (add `syntaxTheme`)
- `GenerateCSSConfig` — currently undocumented entirely
- The custom-plugin example, which shows `theme(mode)` as a method; it is a **getter**
  returning a function
- The exports table vs `package.json` exports (`draftly/lib` is missing)

## Affected areas

- `README.md` (repo root and/or `packages/draftly/README.md`)
- Possibly `editor/draftly.ts` if `themeStyle` is reinstated
- `artifacts/memory.md` — close Q1 and Q2 once answered

## Acceptance

- [ ] Every option in every README config table exists in the corresponding type
- [ ] Every README code example runs as written
- [ ] `syntaxTheme`, `generateCSS`, and `draftly/lib` documented
- [ ] The server-side sanitization caveat is stated in the preview section (see T-003)
- [ ] Memory Q1 and Q2 closed

## Notes

- Discovered during the 2026-08-18 artifact bootstrap; recorded rather than fixed, per
  the instruction to ask about conflicts first.
