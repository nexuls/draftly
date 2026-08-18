# C-026 — Plugin collections are shared mutable singletons

**Status:** Complete
**Priority:** High
**Created:** 2026-08-18
**Completed:** 2026-08-18
**Blocked on:** — (developer approved "as proposed" on 2026-08-18)

## Problem

`plugins/index.ts:38-53` exports pre-constructed instances:

```ts
const essentialPlugins: DraftlyPlugin[] = [
  new ParagraphPlugin(),
  new HeadingPlugin(),
  ...
];

const allPlugins: DraftlyPlugin[] = [...essentialPlugins];
```

`allPlugins` is a copy of the *array*, so both collections contain **the same instances**.
Every consumer of the library shares one set of plugin objects.

Those objects carry mutable per-view state:

- `_config` and `_context` on the base class (`plugin.ts:67-70`), set by `onRegister`
- `draftlyConfig` on the table plugin (`table-plugin.ts:740`)
- the three pending-view re-entrancy locks (`table-plugin.ts:741-743`)

With two editors on one page — a realistic setup for a split view, a modal, or a docs site
with multiple examples — this breaks:

1. **Config cross-talk.** The second `draftly()` call's `onRegister` (`draftly.ts:118`)
   overwrites the first's `_context` and `draftlyConfig`. Editor A then renders using
   editor B's configuration.
2. **Scheduling cross-talk.** `scheduleNormalization` returns early when
   `pendingNormalizationView === view` (`table-plugin.ts:1122`). With two views, B's
   schedule call overwrites A's pending field, and A's queued microtask then sees
   `pendingNormalizationView !== view` and silently returns (`table-plugin.ts:1128`).
   Editor A's table normalization is cancelled with no error.
3. **Retention.** Combined with T-016, a singleton holding a destroyed view holds it for
   the page's lifetime.

Secondary: `essentialPlugins` and `allPlugins` being identical undermines the documented
bundle-size rationale — `AGENTS.md` describes `allPlugins` as opt-in specifically to keep
the essential path small, and there is currently no difference between them. See T-020.

## Proposed approach

Two viable shapes; the developer should pick.

**Option A — factory functions (recommended).**
```ts
export function createEssentialPlugins(): DraftlyPlugin[] { return [new ParagraphPlugin(), ...]; }
export function createAllPlugins(): DraftlyPlugin[] { ... }
```
Each editor gets its own instances. Simple, obvious, and matches how consumers already
construct plugins when customising (`new HeadingPlugin()` appears throughout the README).
Cost: breaking change for anyone importing the arrays.

**Option B — move view-scoped state out of the plugin.** Keep the singletons and store
per-view state in a `WeakMap<EditorView, State>` or a CodeMirror `StateField`. Non-breaking,
and arguably the more correct architecture — plugins become stateless descriptors, which
is closer to how CodeMirror models extensions. Cost: a larger refactor touching the table
plugin's scheduling mechanism, which is the most delicate code in the repo.

*Recommendation: A for the API, B's discipline for new code.* Ship A, and add a rule that
plugins must not hold view-scoped state so the problem cannot return through the back door.

Either way:

- Keep backwards-compatible array exports through one deprecation cycle if possible, with
  a `@deprecated` JSDoc tag pointing at the factory.
- Make `allPlugins` actually differ from `essentialPlugins`, or drop one of them (T-020).
- Add a plugin-authoring rule about view-scoped state to the checklist.

## Affected areas

- `plugins/index.ts` — the collections
- `editor/plugin.ts` — `_config`/`_context` ownership, authoring rule
- `plugins/table-plugin.ts` — the four stateful fields
- `apps/web/app/playground/page.tsx` — `allPlugins` usage at `:24`, `:32`, `:290`
- `README.md` — every example importing the collections
- `artifacts/architecture/plugin-system.md` — plugin instance lifetime
- `.changeset/` — breaking change entry
- `artifacts/memory.md` — durable fact

## Outcome

**Option A, as recommended** — `createEssentialPlugins()` and `createAllPlugins()`, with
the deprecated arrays retained for one cycle, plus Option B's discipline written down as an
authoring rule.

Shipped as a **minor**, not a major: `essentialPlugins` and `allPlugins` are still exported
and still behave exactly as before, shared instances included. That is deliberate — a
consumer who merely recompiles keeps the old behaviour *and* the old bug, and the
`@deprecated` tag is what tells them to migrate. Silently changing the arrays to fresh
instances would have been the more tempting fix and a worse one: it would alter behaviour
for everyone with no import change to notice.

**`table-plugin.ts` was not touched.** The task listed it under affected areas, but that
was Option B's cost. All four stateful fields (`draftlyConfig` and the three
`pending*View` locks) are already *instance* fields, so per-editor instances fix them
without an edit — which is the main argument for A over B. An audit of module-level `let`
across `plugins/` found only three, all legitimately process-wide (`mermaidInitialized`,
`mermaidCounter`, `Punctuation`).

Deliberately **not** done: making `allPlugins` differ from `essentialPlugins`. That is
T-028, which is still unapproved, and the index already flags that both tasks change
`plugins/index.ts` and should be coordinated. `createAllPlugins()` delegates to
`createEssentialPlugins()` so T-028 has one place to change.

`onUnregister`'s deprecation note said "its fate is tied to T-017". Half its rationale is
now obsolete — clearing `_context` no longer breaks other editors — but it stays uncalled,
because plugin registration is still not scoped to a view. The JSDoc was corrected rather
than left stale.

## Acceptance

- [x] Two editors on one page do not share plugin state — verified against the **built**
      package: `createAllPlugins()` twice yields distinct instances, and the four
      cross-talking `TablePlugin` fields are own properties, not prototype or module state.
- [x] Two editors with different configs each render with their own config — reproduced
      both ways. Registering two sets against different `PluginContext`s: with the
      deprecated array editor A reads back `"B-config"`; with the factories A reads
      `"A-config"` and B reads `"B-config"`.
- [x] Table normalization works in both editors independently — verified at the mechanism
      level: two instances hold independent `pendingNormalizationView`, where the shared
      array has B's assignment clobber A's (which is precisely what makes A's queued
      microtask return silently). **Not** verified by driving two live editors — no jsdom
      in the repo, so no `EditorView` can be constructed headlessly.
- [x] Existing single-editor usage is unaffected — the deprecated arrays are byte-for-byte
      the same shape and same instances; the playground builds and renders; and
      `scripts/theme-snapshot.ts` output is **identical** across all three themes
      before and after.
- [x] Changeset written; README examples updated — both READMEs, `CONTRIBUTING.md`, and
      the playground's seed walkthrough (with `VERSION` bumped 1 → 2, per the caching trap).
- [x] A documented rule prevents new plugins from holding view-scoped state — added to the
      `DraftlyPlugin` class JSDoc, `AGENTS.md`'s add-a-plugin checklist (new step 9) and
      traps list, and a new "Instance lifetime" section in
      `architecture/plugin-system.md`.

Also checked, because it was the obvious way to break something: **C-024's tree-shaking
still holds.** Keeping the deprecated arrays as eager module-level consts could have
re-pinned every plugin class, but under `sideEffects: false` they are dropped when unused —
`import { draftly }` bundles to 2.3 MB with zero mermaid and zero KaTeX, unchanged.

## Notes

- **This is public API.** `essentialPlugins` and `allPlugins` are exported from the package
  root and the `draftly/plugins` subpath. Confirm the versioning intent with the developer
  before starting — per `AGENTS.md`, API surface changes must be flagged, not assumed.
- Reproduce first: render two `<CodeMirror>` instances in the playground with different
  plugin sets and observe the config cross-talk. A failing repro is worth more than the
  argument above.
- **2026-08-18 — the repro, and why it did not need a browser.** The cross-talk is entirely
  in `onRegister`, which is plain object mutation; two `PluginContext`s and two
  `onRegister` loops reproduce it in Node in ten lines, with no `EditorView` involved. That
  is a stronger artefact than the playground suggestion in the note above, because it
  isolates the mechanism instead of the symptom. What it cannot cover is the *scheduling*
  half, which needs a live view — that was verified structurally instead, and the gap is
  recorded in the acceptance list rather than glossed.
- **The playground now models the rule it documents.** It builds one module-level set via
  `createAllPlugins()` and exports it for `devbar` to read, rather than each file importing
  a shared array. A single editor genuinely only needs one set; the comment says so, so the
  example does not read as an endorsement of module-level sharing.
- Depends on T-016 for the retention half of the problem.
