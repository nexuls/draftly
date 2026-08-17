# T-007 — Wire up the type-check task

**Status:** Proposed
**Priority:** Low
**Created:** 2026-08-18
**Blocked on:** Naming decision — memory Q4

## Problem

`turbo.json` declares:

```json
"check-types": { "dependsOn": ["^check-types"] }
```

But every package defines the script as `typecheck`:

```json
"typecheck": "tsc --noEmit"    // packages/draftly, apps/web
```

Nothing connects the two. `turbo run check-types` matches no tasks and exits successfully
having done nothing — the failure mode is a **silent pass**, which is worse than an error.

Consequently there is no single root command that type-checks the workspace, and no root
`typecheck` script in the root `package.json` either. Type checking currently only happens
via editor feedback and `next build`.

## Proposed approach

Pick one name and use it consistently.

1. **Choose the name.** `typecheck` matches the existing package scripts and is the more
   common convention; `check-types` matches the current `turbo.json` and Turborepo's own
   starter templates. _Recommendation: `typecheck`_ — it changes one line of config
   rather than two package files, and matches what is already written in the packages.
2. **Align `turbo.json`** — rename the task, keep `dependsOn: ["^typecheck"]`, and add
   `outputs: []` so it caches correctly (a type check produces no artifacts but its
   success is cacheable).
3. **Add a root script**: `"typecheck": "turbo run typecheck"`.
4. **Verify it actually runs** — introduce a deliberate type error, confirm a non-zero
   exit, then revert. Given the failure mode here was a silent pass, this step is the
   important one.
5. **Document** the command in `CONTRIBUTING.md` and `build-and-tooling.md`.

Consider adding it to CI alongside lint and build, if CI configuration exists or is added
later.

## Affected areas

- `turbo.json`
- `package.json` (root)
- `packages/draftly/package.json`, `apps/web/package.json` — only if `check-types` wins
- `CONTRIBUTING.md`, `artifacts/architecture/build-and-tooling.md`

## Acceptance

- [ ] `bun run typecheck` from the root type-checks every package
- [ ] A deliberately introduced type error causes a non-zero exit
- [ ] Task name is identical in `turbo.json` and every `package.json`
- [ ] Docs updated; memory Q4 closed

## Notes

- Small and self-contained — a good first task for a session with spare capacity.
