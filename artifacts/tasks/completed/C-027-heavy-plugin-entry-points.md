# C-027 — Split the heavy plugins behind their own entry points

**Status:** Complete
**Priority:** High
**Created:** 2026-08-18
**Completed:** 2026-08-19
**Blocked on:** — (developer approved 2026-08-19)

## Problem

The remaining step of T-020 (see [C-024](../completed/C-024-bundle-size.md)), split out
because it is a **breaking change to the public export surface** and the rest was not.

`AGENTS.md` states that bundle size is a design constraint and that this "is why
`allPlugins` is opt-in". That second half is still not true:

```ts
// plugins/index.ts
const allPlugins = [...essentialPlugins];
```

Same instances, same modules. The distinction the constraint rests on does not exist, and
`plugins/index.ts` still statically imports all 14 plugin modules — so
`import { allPlugins } from "draftly"` reaches mermaid and KaTeX because it genuinely
needs to, and `import { essentialPlugins }` reaches them for no reason at all.

C-024 made this stop mattering for consumers who import only `draftly`: with the
import-time side effects gone and `sideEffects: false` declared, unused plugin modules are
now dropped. What remains is making the documented distinction real.

## Proposed approach

1. **Give the heavy plugins their own entry points** — `draftly/plugins/mermaid`,
   `draftly/plugins/math`, and possibly `draftly/plugins/emoji` — kept out of the
   `plugins` barrel.
2. **Make `essentialPlugins` genuinely exclude them and `allPlugins` genuinely include
   them**, matching the documented intent.
3. **Consider dynamic `import()` inside the widgets** so the cost is paid on first use
   rather than at load. Weigh against the added async complexity in `toDOM`, which now has
   teardown guards (C-019) that a dynamic import would have to respect.

Rejected in T-020 and still rejected: making mermaid and katex peer dependencies. It
pushes the install burden onto every consumer including those who want diagrams, for no
size win once they install them.

## Affected areas

- `packages/draftly/package.json` — `exports`
- `packages/draftly/tsup.config.ts` — new entries
- `src/index.ts`, `src/plugins/index.ts` — barrel composition, collection membership
- `README.md` — import guidance for the heavy plugins
- `apps/web/app/playground/page.tsx` — imports
- `artifacts/repository-map.md` — subpath export map table
- `artifacts/architecture/build-and-tooling.md`
- `.changeset/` — a breaking-change entry

## Outcome

Steps 1 and 2 shipped. Step 3 (dynamic `import()`) was **considered and declined** — see
below.

**The problem was much larger than this task described.** The task framed it as making a
documented distinction real, on the assumption that C-024 had already fixed the practical
cost for most consumers. Measurement said otherwise:

```
import { HeadingPlugin } from "draftly/plugins"   →  8.0 MB
```

One small plugin pulled mermaid, KaTeX *and* node-emoji. The mechanism is that tsup
concatenates everything reachable from an entry point into a single chunk — all 14 plugins
became one 223 KB chunk whose top level ran `import mermaid from 'mermaid'` — and a
top-level import in a retained chunk is evaluated whenever *any* binding in that chunk is
used. C-024's `sideEffects: false` lets a bundler drop draftly's own modules, which is why
`import { draftly }` was clean, but it cannot drop a third-party package the bundler
cannot prove pure. CJS consumers had no tree-shaking at all.

So this was not a tidiness change; it was a 5.5 MB bug on the default import path.

### Measured, by bundling

| Scenario                                          | Before | After  | Heavy deps after |
| ------------------------------------------------- | ------ | ------ | ---------------- |
| `import { HeadingPlugin } from "draftly/plugins"` | 8.0 MB | 2.5 MB | none             |
| `createEssentialPlugins()`                        | 8.0 MB | 2.5 MB | none             |
| essentials + `MathPlugin`                         | —      | 2.9 MB | katex only       |
| `createAllPlugins()`                              | 8.0 MB | 8.0 MB | all three        |

(The 2.5 MB floor is CodeMirror, which is a peer dependency and bundled here only because
the probe resolves it from `apps/web`.)

### Shape

| Entry point               | Contents                                  |
| ------------------------- | ----------------------------------------- |
| `draftly/plugins`         | 11 light plugins, `createEssentialPlugins()`, deprecated `essentialPlugins` |
| `draftly/plugins/mermaid` | `MermaidPlugin` |
| `draftly/plugins/math`    | `MathPlugin`, `latexHighlightTags` |
| `draftly/plugins/emoji`   | `EmojiPlugin` |
| `draftly/plugins/all`     | `createAllPlugins()`, deprecated `allPlugins`, re-exports of all three |

**`EmojiPlugin` was split too**, which the task left as "possibly". Decided on the numbers:
`node-emoji` is 312 KB bundled — two thirds of KaTeX — which is a poor default for
`:shortcode:` support. Splitting all three also turns a case-by-case judgement into a rule
future plugins can follow: a heavy third-party dependency means an entry point.

**`createAllPlugins()` had to move to `plugins/all.ts`.** Left beside
`createEssentialPlugins()` it would make the heavy modules reachable from the light entry
and put them straight back in the light chunk. That is the single edit that reverts this
change, and it is called out in `plugins/index.ts`, `AGENTS.md` and
`architecture/build-and-tooling.md` for that reason.

**Step 3 — dynamic `import()` in the widgets — declined.** The entry-point split already
takes the cost off every consumer who does not ask for the feature; what dynamic import
would add is deferring it for consumers who *did* ask, in exchange for putting an await
into `toDOM` paths that C-019 just finished guarding for teardown. Bad trade at this point.
Worth revisiting only if first-paint cost for mermaid users becomes a complaint.

**Not done:** removing the deprecated `essentialPlugins` / `allPlugins` arrays. This is a
major, so it was the obvious moment — but C-026 promised them one deprecation cycle, and
"a major happened to land" is not the same as that cycle being over. Still open.

## Acceptance

- [x] `essentialPlugins` and `allPlugins` differ, and the difference is the heavy plugins —
      11 vs 14, verified against the built package.
- [x] Importing `essentialPlugins` bundles neither mermaid nor KaTeX — verified by
      bundling (table above), and structurally by walking the emitted chunk graph:
      `dist/plugins/index.js` **and** `dist/plugins/index.cjs` reach only CodeMirror peers,
      `dompurify` and `style-mod`. `dist/plugins/all.cjs` reaches all three heavy packages.
      Both module systems checked, because CJS was the case tree-shaking could never help.
- [x] The playground still loads every plugin — it imports `draftly/plugins/all`
      deliberately, builds clean, and mermaid, katex, emoji and table code are all present
      in the emitted client chunks. `scripts/theme-snapshot.ts` output is **byte-identical**
      to the pre-change snapshot across all three themes, which is the check that no
      plugin was silently dropped from the set.
- [x] Migration guidance in the changeset and README — changeset has a `diff`-formatted
      migration for all three cases; both READMEs gained a cost table and a compose-your-own
      example.

## Notes

- **Sequence after T-027.** Adding entry points around a module that still carries an
  unresolvable `?raw` import would bake the problem into more of the export surface.
- **Coordinate with T-017.** Both rewrite the exports in `plugins/index.ts`; landing them
  separately means two breaking changes where one would do.
- **2026-08-19 — both notes held up, and the sequencing mattered.** C-025 landed first, so
  `math.ts` exports a plugin whose KaTeX CSS is already an ordinary import; had it not,
  the `?raw` specifier would now be reachable from a second public entry point. C-026
  landed first too, and its `createAllPlugins()` delegating to `createEssentialPlugins()`
  is exactly the seam this change needed — the membership split was a two-line edit rather
  than a rewrite.
- **The `draftly/src/*` export needed widening.** The playground imports raw TypeScript,
  and `"./src/*": "./src/*"` cannot resolve `draftly/src/plugins/all` to `all.ts`. Changed
  to `["./src/*.ts", "./src/*"]`, which resolves extensionless deep imports first and keeps
  the bare form as a fallback. Nothing was importing `draftly/src/<subpath>` before, so
  there was nothing to break.
