# C-006 — Vendored agent skills

**Status:** Complete
**Priority:** Low
**Completed:** commit `eae4434`
**Reconstructed:** 2026-08-18 from git history.

## Problem

Agents working on Draftly need domain knowledge in two areas that are easy to get subtly
wrong and expensive to re-derive from source each session:

- **CodeMirror 6** — decorations, view plugins, facets, extension precedence, widgets.
  The whole library is built on it, and its concepts (precedence, range sets, atomic
  ranges) do not resemble other editor frameworks.
- **Turborepo** — task pipelines, caching semantics, workspace boundaries, filtering.

## Outcome

Vendored two skills into `.agents/skills/`, pinned by content hash in `skills-lock.json`:

| Skill        | Source                    | Contents                                                                                                                                    |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `codemirror` | `solanabettercall/skills` | `SKILL.md`, `references/architecture.md`, `references/extensions.md`, `assets/basic-setup.ts`                                               |
| `turborepo`  | `vercel/turborepo`        | `SKILL.md`, plus `references/` covering best practices, boundaries, caching, CI, CLI, configuration, environment, filtering, and watch mode |

Both carry `references/` subdirectories with considerably more depth than their top-level
`SKILL.md`.

## Durable consequences

- **Consult the relevant skill before non-trivial work in its domain** — this is one of
  the developer's stated working preferences, recorded in
  [`../../memory.md`](../../memory.md).
- The Turborepo skill's `references/` is organised by topic with a `RULE.md` per area;
  read the specific topic file rather than only the `SKILL.md` summary.
- `skills-lock.json` pins content hashes, so the vendored copies do not drift silently.
