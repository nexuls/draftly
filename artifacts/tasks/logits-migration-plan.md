# Migration plan — `logits` fork → `draftly`

**Created:** 2026-08-18
**Status:** Proposed — needs developer decisions before any code moves
**Source:** `/home/nexul/projects/logits`, `src/components/draftly/`
**Fork point:** logits `9a2d784` "feat: Copied draftly codebase locally for development" (2026-03-30)

---

## How the two repos relate

`logits` is a single Next.js app. On 2026-03-30 it vendored the whole library into
`src/components/draftly/` and evolved it in place for ~5 weeks. `draftly` (this repo) kept
going independently and spent 2026-08-18 on the audit backlog (C-011 – C-024).

Neither side has the other's work. The vendored copy has **no new files** — every change is
an edit inside a file that also exists here, so nothing can be cherry-picked across; each
item has to be re-applied by hand against the post-audit code.

17 logits commits touch the library:

| Commit    | Subject                                              | Verdict |
| --------- | ---------------------------------------------------- | ------- |
| `6d05169` | refactor: update using AGENT standard and formatted  | **Reject** |
| `bafd809` | feat: Align the draftly styles with the project      | **Adapt** → M1 |
| `7b0535a` | refactor: Lint + Format                              | **Reject** |
| `9219320` | fix: editor theme surfaces                           | Folded into M1 |
| `e29980f` | feat: Code plugin => header, caption visible always  | **Take** → M8 |
| `3a338ea` | fix: colors                                          | Folded into M1 |
| `7925b57` | format                                               | **Reject** |
| `99d8042` | fix: style                                           | Folded into M1 |
| `a8d853d` | fix: style                                           | **Split** → M1 + M9 |
| `1376962` | fix: draftly preview styles                          | **Adapt** → M6 |
| `a764b67` | format                                               | **Reject** |
| `e0cfe6f` | fix: type error                                      | **Reject** (see below) |
| `f016b2f` | fix: syntax theme for preview breaking the editor    | **Take** → M5 |
| `4e8d1c0` | feat: title/description on plugin keyboard shortcuts | **Take** → M4 |
| `d0bbc60` | fix: Reveal list syntax while cursor on mark         | **Take** → M7a |
| `2872d83` | fix: list indentation in preview                     | **Adapt** → M7b |
| `b7df0a8` | feat: latex language support                         | **Split** → M2 + M3 |

---

## What is *not* worth migrating

**The 2,170-line diff is mostly formatting.** `6d05169` alone is 1,620 insertions and is
almost entirely a reflow: logits' `biome.json` sets `lineWidth: 80` and trailing commas
`all`; this repo's `packages/biome-config/base.json` sets `lineWidth: 120` and
`trailingCommas: "es5"`. The rest of that commit is `import type` modifiers and JSDoc.

I verified this is not hiding features. Every identifier `6d05169` appears to add to
`code-plugin.ts` (`TEXT_HIGHLIGHT_PATTERN`, `applyTextHighlights`,
`computeDiffDisplayLineNumbers`, `renderDiffPreviewLine`, `computeChangedRanges`,
`highlightInstanceCounters`) already exists here — they show as `+` lines only because
their signatures were wrapped. Same for the 671-line `table-plugin.ts` hunk and all of
`editor/` and `preview/`. Migrating any of it would fight the repo's own formatter for
zero behaviour change.

**`e0cfe6f`** changes `return result;` to `return result as string;` in `renderer.ts`. It
patches a type error that only exists in logits' variant of that file; the cast papers over
a nullability question rather than answering it. Not worth carrying.

---

## M1 — Design-token theming layer (the architectural change)

**Priority: High. This is the item with the most leverage.**

Today every plugin hardcodes colours twice — once in `default`, once in `dark`. The
current counts:

|          | hardcoded hex colours | plugins with a `dark:` layer |
| -------- | --------------------- | ---------------------------- |
| draftly  | 86                    | 6                            |
| logits   | 1                     | 0                            |

logits replaced all of it with a semantic token layer. `editor/theme.ts` declares
`--draftly-*` custom properties once on `&.cm-draftly`, and every plugin theme reads them:

```ts
".cm-draftly-link-text": { color: "var(--draftly-color-link)" },
```

`link-plugin.ts` lost its entire `dark` block as a result, because the token resolves
differently per theme on its own. The vocabulary is roughly:

- `--draftly-color-{link,link-hover,muted,success,success-strong,danger,danger-strong,warning,warning-strong,tooltip-bg,tooltip-fg}`
- `--draftly-surface-{1,2,3,hover,success,success-strong,danger,danger-strong,warning,warning-strong}`
- `--draftly-shadow-{soft,strong}`

**This cannot be taken verbatim.** logits maps each token onto *its app's* shadcn/Tailwind
v4 variables — `var(--color-primary)`, `var(--color-muted-foreground)`,
`var(--color-destructive)`, `var(--user-text-font)`, `var(--text-base)`, `var(--radius-sm)`.
A published library that renders unstyled unless the host happens to define those is not
shippable.

**Proposed adaptation.** Keep the token layer, change what backs it: give every
`--draftly-*` token a self-sufficient default and let a host override it.

```ts
"--draftly-color-link": "var(--color-primary, #0366d6)",
```

That preserves standalone rendering, and drop-in theming for a shadcn host, with one
declaration. The dark layer then only redefines tokens, never per-plugin rules.

Sequencing, one commit per step so a regression is bisectable:

1. Add the token block to `editor/theme.ts` with fallbacks. No plugin changes.
2. Convert plugins one at a time, deleting each `dark` layer as its tokens land.
   Order by size: `link` → `image` → `math` → `mermaid` → `table` → `code-plugin.theme`.
3. Document the token contract in `artifacts/architecture/` and the README — it becomes
   public API the moment it ships.

**Watch for:** `generateCSS()` must emit the token block too, or preview goes unstyled
while the editor looks right. That is the `wrapperClass` trap from `AGENTS.md`, in a new
costume. This interacts with M6 — do M6 first.

---

## M2 — LaTeX syntax highlighting inside math *(needs approval: new dependency)*

`b7df0a8` overlays a real LaTeX parser on math content via `parseMixed`, so `$…$` and
`$$…$$` get tokenised instead of rendering as plain text:

```ts
wrap: parseMixed((node) => {
  if (node.name !== "InlineMath" && node.name !== "MathBlock") return null;
  return { parser: latexMathParser, overlay: [{ from: node.from, to: node.to }] };
}),
```

`latexMathParser` is `latexLanguage.parser.configure(...)` with a `styleTags` block that
tags ~40 control-sequence node types the upstream package leaves untagged.

**Blocker.** This adds `codemirror-lang-latex` as a runtime dependency of
`packages/draftly`. `AGENTS.md` forbids that without asking, and bundle size is why
`allPlugins` is opt-in. The package is not small, and it lands on everyone importing
`MathPlugin`.

Options, in the order I'd rank them:

1. **Lazy-load it** — `await import("codemirror-lang-latex")` behind a `MathPlugin`
   constructor option, defaulting off. Costs nothing to consumers who don't opt in. Fits
   the same shape as T-028's heavy-plugin-entry-points work; check for overlap before
   starting.
2. Accept the dependency, gated by a constructor flag, and measure the delta first.
3. Make it a peer dependency and no-op when absent.

**Do not start M2 until this is decided.** M3 is independent and can go first.

---

## M3 — Math block parser fixes *(no dependency; take now)*

Buried in `b7df0a8` are two genuine parser bugs, unrelated to the LaTeX feature.

**Single-line `$$…$$` does not parse.** The current scanner (`math-plugin.ts:248-250`)
only ever looks for the closing fence on a *later* line, so `$$x^2$$` on one line falls
through to a paragraph. The fix checks for a same-line close first:

```ts
const sameLineClose = text.indexOf("$$", openIdx + 2);
if (sameLineClose !== -1) { endPos = startLine + sameLineClose + 2; cx.nextLine(); }
```

**The opening marker is mispositioned when the block is indented.**
`math-plugin.ts:277` computes it as `startLine + text.indexOf("$$") + 2` — searching from
index 0 rather than from `line.pos`. Inside a list item or blockquote, `line.pos` is past
the container prefix, so the marker node covers the wrong range. Fixed by anchoring to the
already-computed `openIdx`.

Also drops the `.cm-draftly-math-block br { display: none }` rule and adds
`opacity: 0.7` to the marker.

**Verify:** an indented `$$` block inside a list item, and a single-line `$$x^2$$`, in both
editor and preview.

---

## M4 — `DescribedKeyBinding`: name + description on shortcuts *(public API)*

`4e8d1c0` adds a documentation layer over keymaps so a host can render a shortcuts dialog:

```ts
export interface DescribedKeyBinding extends KeyBinding {
  name: string;         // "Bold"
  description: string;  // "Toggle bold (**text**) on the selection"
}
```

`DraftlyPlugin.getKeymap()` returns `DescribedKeyBinding[]`; because it extends
`KeyBinding`, CodeMirror consumes it unchanged. Metadata was filled in for `inline` (6
bindings), `code`, `image`, `link`, `list`, and `table` (the largest, +78 lines).

**API-break flag.** As written, `name` and `description` are **required**. Any external
plugin overriding `getKeymap(): KeyBinding[]` stops typechecking — the return type
narrowed. `draftly` is published and this is exactly the kind of change `AGENTS.md`
says to flag rather than land quietly.

Recommendation: ship the fields **optional** (`name?`, `description?`). A host renders what
it has; nothing breaks; the built-in plugins still populate them. If they must be required,
it's a major version and a changeset.

Also needs, and logits does not have: a public accessor to enumerate every registered
plugin's bindings. Without one, a consumer has to reach into plugin instances. Worth adding
alongside — `Draftly.getShortcuts(): DescribedKeyBinding[]`.

---

## M5 — Preview syntax CSS leaks out and restyles the editor *(bug; take now)*

`generateSyntaxThemeCSS()` in `preview/syntax-theme.ts:22` takes `_wrapperClass` — the
underscore is not a style choice, the parameter is genuinely ignored. Every rule it emits
is therefore global, and the editor picks up the preview's syntax theme.

logits' fix scopes each selector as it is emitted:

```ts
cssChunks.push(scopeCssToWrapper(rules, wrapperClass));
```

`scopeCssToWrapper` splits selector groups on `,` and prefixes `.${wrapperClass} ` to each,
skipping at-rules via the `[^@{}]` guard in its pattern.

**Caveat to check before landing:** the regex is naive about at-rules. `@media` blocks pass
the `^@` guard at the top level, but the selectors *inside* them are matched after a `}`
boundary and will be scoped — which is correct — while the `@media` wrapper itself is left
alone. Worth a test against a `HighlightStyle` that emits one before calling this done.

Smallest, highest-confidence item on the list. Good first commit.

---

## M6 — Share the editor base theme with the preview

`1376962` stops the preview from carrying its own three-line stylesheet and derives it from
the editor's, so the two surfaces genuinely cannot drift:

```ts
export const draftlyBaseThemeRaw = { /* … */ };
export const draftlyBaseTheme = EditorView.theme(draftlyBaseThemeRaw);
```

```ts
const baseStyles = new StyleModule(draftlyBaseThemeRaw, {
  finish: (selector) => selector
    .replace(/&\.cm-draftly/g, ".draftly-preview")
    .replace(/&/g, ".draftly-preview"),
}).getRules();
```

This is the right idea and it is the precondition for M1 — the token block lives in
`draftlyBaseThemeRaw`, so exporting it is what lets preview and editor share tokens.

**Two defects to fix on the way in:**

1. The `finish` callback **hardcodes `.draftly-preview`** while `generateCSS()` accepts a
   configurable `wrapperClass`. Anyone passing a custom wrapper gets unstyled output — the
   exact `wrapperClass` mismatch trap in `AGENTS.md`. Thread the real value through.
2. `preview.ts` was changed to wrap content in `<div class="cm-content">` so the
   `&.cm-draftly .cm-content` rules apply. That **changes the published HTML shape** and
   leaks a CodeMirror-internal class name into static output. Prefer rewriting the
   `.cm-content` portion of the selector to target the wrapper directly, and leave
   `preview()`'s output alone.

---

## M7 — List plugin

**M7a — reveal syntax only when the cursor is on the mark.** One-line fix, take as-is.
`decorateListMark` currently gets `cursorInLine`, so putting the cursor anywhere on a list
line un-styles its bullet. Passing `ctx.cursorInRange(from, to + 1)` narrows it to the mark
itself. `cursorInRange` already exists on `DecorationContext` here
(`editor/plugin.ts:95`), so this ports directly.

**M7b — preview indentation.** Restructures the list CSS into nested rules and indents by
depth:

```ts
"&.cm-draftly-list-line-ul, &.cm-draftly-list-line-ol": {
  paddingLeft: "calc(1rem + (1rem * (var(--depth, 0) + 1))) !important",
},
```

**Verify before porting:** this depends on a `--depth` custom property being set on the
rendered element, and on `.cm-draftly-list-line-*` (an *editor line* class) appearing in
preview output. Confirm `ListPlugin.renderToHTML` in this repo actually emits both. If it
doesn't, the rule is inert and the `!important` is hiding that. Do not land it on the
strength of the diff alone.

---

## M8 — Code block header and caption stay visible while editing *(take)*

`e29980f`. Today the header (title/language/copy) and caption vanish the moment the cursor
enters the block — the content jumps as you click into it. The fix separates two questions
that were conflated into one `cursorInRange`:

- `cursorInCodeBlock` — still gates line-level decorations.
- `cursorOnFenceLine` — new; only *this* reveals the ``` markers.

Header and caption then become unconditional. Small, self-contained, clearly better.

---

## M9 — Paragraph line decoration *(adapt — as written it violates C-016)*

`a8d853d` gives `ParagraphPlugin` a `buildDecorations` that applies a
`cm-draftly-paragraph` line class in the editor, so paragraph spacing matches preview.

**Must be rewritten before landing.** It uses `syntaxTree(view.state).iterate` — the
unbounded walk that C-016 removed library-wide, costing O(document) on every keystroke
*and* every cursor move. Rewrite against `ctx.iterateVisible`.

Its theme change also ships two commented-out declarations and a malformed value with a
stray semicolon inside the string:

```ts
color: "color-mix(in oklab, var(--color-foreground) 80%, transparent);",
```

That trailing `;` invalidates the declaration. Clean both up.

The sibling edits in the same commit — `.cm-focused { outline: none }`, content
`paddingTop`/`paddingBottom`, heading weights `bold` → `600`/`700`, `h6` bumped to
`--text-lg` — are cosmetic and app-flavoured. Take the `outline: none` (a genuine default
worth having); leave the rest to the M1 token pass.

---

## Suggested order

Ordered so each step de-risks the next, and every step is independently verifiable.

| # | Item                              | Size | Risk   | Gate |
| - | --------------------------------- | ---- | ------ | ---- |
| 1 | M5 — scope preview syntax CSS     | S    | Low    | — |
| 2 | M3 — math block parser fixes      | S    | Low    | — |
| 3 | M7a — list mark reveal            | XS   | Low    | — |
| 4 | M8 — code header/caption          | S    | Low    | — |
| 5 | M6 — share base theme             | M    | Medium | Fix both defects |
| 6 | M1 — design tokens                | L    | Medium | Fallback-value decision |
| 7 | M9 — paragraph decoration         | S    | Low    | After M1; rewrite for `iterateVisible` |
| 8 | M4 — `DescribedKeyBinding`        | M    | **API**| Optional-vs-required decision |
| 9 | M7b — list preview indentation    | S    | Medium | Confirm `--depth` is emitted |
| — | M2 — LaTeX highlighting           | M    | **Dep**| Dependency approval |

1–4 are pure wins and could land today. Each needs a changeset (all are user-facing) and
its artifact updates in the same commit, per `AGENTS.md` §5.

---

## Open questions for the developer

Per `AGENTS.md` §1 these are logged rather than resolved. Add to
[`artifacts/memory.md`](../memory.md#open-questions-for-the-developer) once answered.

1. **M2** — take `codemirror-lang-latex` as a dependency at all? If yes: lazy-loaded
   behind an opt-in flag, eager, or peer?
2. **M1** — `var(--color-primary, #0366d6)` fallbacks, or a `--draftly-*`-only vocabulary
   with the shadcn mapping shipped as a separate opt-in preset?
3. **M4** — `name`/`description` optional (compatible) or required (major version)?
   And should `Draftly` expose a `getShortcuts()` accessor?
4. **M6** — is changing `preview()`'s output shape acceptable, or must the selector
   rewrite absorb `.cm-content` instead?
5. **M8** — is a permanently visible code header the intended default, or should it be a
   `CodePlugin` option?
