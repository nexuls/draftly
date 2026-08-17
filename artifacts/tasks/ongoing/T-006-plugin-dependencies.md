# T-006 — Resolve or remove `plugin.dependencies`

**Status:** Proposed
**Priority:** Medium
**Created:** 2026-08-18
**Blocked on:** Developer decision — memory Q3

## Problem

`DraftlyPlugin` declares:

```ts
/** Plugin dependencies - names of required plugins */
readonly dependencies: string[] = [];
```

Nothing reads it. There is no topological sort in `draftly()`, no validation that a
declared dependency is present, and no plugin currently populates it. It is an API
promise the library does not keep.

Ordering today is controlled entirely by `decorationPriority` (ascending) for decorations,
and by array order for keymaps and extensions. That works, but it encodes dependencies
implicitly as magic numbers — `HTMLPlugin` uses priority 30 specifically so it runs after
everything else, and nothing states that requirement anywhere the compiler can see it.

Leaving a declared-but-inert field is the worst of both worlds: a plugin author who
populates it in good faith gets silent no-op behaviour.

## Proposed approach

Two coherent options; the developer picks.

### Option A — implement it

1. Validate at composition time in `draftly()`: for each plugin, assert every name in
   `dependencies` exists in the plugin array; throw (or warn) with a clear message naming
   both plugins.
2. Topologically sort the plugin list by `dependencies` before processing, so extension
   and keymap registration order respects declared relationships.
3. Decide how it interacts with `decorationPriority` — the cleanest answer is that
   `dependencies` orders _registration_ while `decorationPriority` orders _decoration_,
   and they stay independent. Document that distinction explicitly.
4. Populate it where a real relationship exists (e.g. `HTMLPlugin` on the plugins whose
   output it must observe) and consider deriving priority bands from it later.

### Option B — remove it

Delete the field and its JSDoc, and document in `plugin-system.md` that ordering is
`decorationPriority` plus array order, deliberately. Smaller, honest, and loses nothing
that is currently used.

_Recommendation: Option B unless a concrete ordering bug exists._ The priority-band system
is working; adding a second ordering mechanism for a hypothetical need is complexity
without a driver. Option A becomes right the moment a plugin genuinely cannot function
without another.

## Affected areas

- `editor/plugin.ts` — the field
- `editor/draftly.ts` — validation/sort, if Option A
- `artifacts/architecture/plugin-system.md` — the metadata section either way
- `README.md` — if `dependencies` appears in public plugin docs

## Acceptance

- [ ] `dependencies` either does what it says or no longer exists
- [ ] `plugin-system.md` states the actual ordering rules with no "declared but inert" note
- [ ] Memory Q3 closed

## Notes

- Whichever option wins, the _reason_ belongs in `memory.md` — a future agent will
  otherwise re-propose the discarded one.
