# T-017 — Plugin collections are shared mutable singletons

**Status:** Proposed
**Priority:** High
**Created:** 2026-08-18
**Blocked on:** Developer decision — this changes public API

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

## Acceptance

- [ ] Two editors on one page do not share plugin state
- [ ] Two editors with different configs each render with their own config
- [ ] Table normalization works in both editors independently
- [ ] Existing single-editor usage is unaffected
- [ ] Changeset written; README examples updated
- [ ] A documented rule prevents new plugins from holding view-scoped state

## Notes

- **This is public API.** `essentialPlugins` and `allPlugins` are exported from the package
  root and the `draftly/plugins` subpath. Confirm the versioning intent with the developer
  before starting — per `AGENTS.md`, API surface changes must be flagged, not assumed.
- Reproduce first: render two `<CodeMirror>` instances in the playground with different
  plugin sets and observe the config cross-talk. A failing repro is worth more than the
  argument above.
- Depends on T-016 for the retention half of the problem.
