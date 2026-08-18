# T-028 — Split the heavy plugins behind their own entry points

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
**Blocked on:** Coordinate with T-017 — both change `plugins/index.ts` exports

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

## Acceptance

- [ ] `essentialPlugins` and `allPlugins` differ, and the difference is the heavy plugins
- [ ] Importing `essentialPlugins` bundles neither mermaid nor KaTeX — verified by
      bundling, not by inspection
- [ ] The playground still loads every plugin
- [ ] Migration guidance in the changeset and README

## Notes

- **Sequence after T-027.** Adding entry points around a module that still carries an
  unresolvable `?raw` import would bake the problem into more of the export surface.
- **Coordinate with T-017.** Both rewrite the exports in `plugins/index.ts`; landing them
  separately means two breaking changes where one would do.
