# C-034 — Replace Changesets with a manual GitHub Actions release

**Status:** Complete
**Priority:** High
**Created:** 2026-10-21
**Blocked on:** —

## Problem

Releasing went through Changesets: a markdown file per change, then `bun run
version-packages`, then `bun run release`. Three problems with it in practice.

1. **Nobody ran steps two and three.** `.changeset/` had accumulated **30 unconsumed
   files** — every user-facing note since 2.1.0, written and committed but never published.
   A per-change ceremony that only pays off at a manual step nobody takes is pure cost.
2. **The information was already in the history.** `AGENTS.md` rule 5 mandates
   `type(scope): Description` on every commit. The changeset files largely restated it,
   with the usual consequence of two sources: they drifted.
3. **There was no CI at all.** No `.github/` directory existed. Nothing verified a release
   before it reached npm, and `changeset publish` ran from whatever the maintainer's working
   tree happened to contain.

Developer asked for a manually-triggered workflow that takes the bump, runs the checks,
publishes, and files a release with notes derived from the commits.

## Discovered during the work

**npm served `draftly@2.1.0` while this repo said `2.0.0`**, with no `## 2.1.0` section in
`CHANGELOG.md`. Raised rather than guessed; the developer pointed at a second checkout,
`/media/D/projects/draftly`. It shares history to `e5dc598` and carries two unpushed
commits — the 2.1.0 changeset and its `RELEASING:` bump. So 2.1.0's *code* was here all
along and only the bookkeeping was missing. Recorded as a trap in `memory.md`.

## What shipped

**Reconciliation.** The 2.1.0 section was re-imported into `packages/draftly/CHANGELOG.md`
verbatim from the other checkout and `package.json` set to `2.1.0`, so the repo agrees with
npm before anything else changed.

**The last `changeset version`.** Run once to fold the 30 pending files into a
`## 3.0.0` section — six of them were `major`, which is where the version comes from. The
file is now a frozen record of the Changesets era; current notes live on GitHub releases.
`changeset version` also bumped the private `apps/web` to 0.1.1 with a changelog of bare
dependency hashes; reverted.

**Removal.** `.changeset/`, `@changesets/cli`, and the `changeset` / `version-packages` /
`release` root scripts are gone. `bun install` dropped one package from `bun.lock`.

**`.github/workflows/release.yml`** — `workflow_dispatch` with inputs `bump` (including
`none`), `version`, `preid`, `npm_tag`, `notes_from`, `provenance` and `dry_run`. The ref to
release from is the dispatch's own, so it is not an input. A run:

1. installs with `--frozen-lockfile`, lints, typechecks both workspaces, runs the test step;
2. resolves the version with `npm version --no-git-tag-version`, then **refuses** to proceed
   if it is already on npm or already tagged;
3. builds `--filter=draftly`;
4. generates the notes into the run summary;
5. commits `chore(release): draftly vX.Y.Z` and tags locally;
6. publishes to npm;
7. only then pushes the commit and tag, and creates the release.

The 5–7 ordering is the point: npm is irreversible, so nothing reaches the remote until it
succeeds, and a failed publish leaves a repeatable run rather than a tag to unpick.

**`.github/scripts/release-notes.ts`** — groups `git log <from>..<to>` by
conventional-commit type into Breaking / Features / Fixes / Performance / Refactoring /
Documentation / Chores, filtering merges and `chore(release):`. Breaking is `!` on the type
or a `BREAKING CHANGE:` footer. An unprefixed subject lands in "Other changes" rather than
being dropped. Runs standalone against any range, so notes can be previewed without a
dispatch.

**The test step is pre-wired for T-001.** It probes `git ls-files '*.test.ts' …` and runs
`bun test` only if something matches, so it is a no-op today and active the moment a test
file lands — without failing every release in between.

## Affected areas

- `.github/workflows/release.yml`, `.github/scripts/release-notes.ts` — new
- `package.json`, `bun.lock`, `.changeset/` — tooling removed
- `packages/draftly/package.json`, `packages/draftly/CHANGELOG.md` — 2.1.0 reconciled, 3.0.0 folded
- `AGENTS.md`, `CONTRIBUTING.md` — the "add a changeset" instruction replaced
- `artifacts/architecture/build-and-tooling.md` — release flow rewritten
- `artifacts/architecture/index.md`, `artifacts/repository-map.md`, `artifacts/memory.md`

## Acceptance

- [x] No Changesets dependency, directory, script or instruction remains outside historical
      task records
- [x] The 30 pending notes survive in `CHANGELOG.md`
- [x] The repo's version agrees with what npm serves
- [x] `bun run lint`, both `typecheck` scripts and `turbo run build --filter=draftly` pass
      locally — the exact commands the workflow runs
- [x] The notes generator produces correct grouped output against real history
- [x] Workflow YAML parses
- [ ] **A real dispatch has not been run.** Needs `secrets.NPM_TOKEN` in the repository and
      a push of this branch before it can be. First run should be `dry_run: true`.

## Notes

- `notes_from` exists because the repo has **no tags at all** — nothing was ever tagged
  under Changesets. Without it the first run would generate notes from the root commit. For
  the first release, pass `e5dc598` (the 2.1.0 code point) or `v2.1.0` once a tag exists.
- The first real release should use `bump: none`: `package.json` already holds the
  unpublished `3.0.0` that the fold produced.
- `provenance` is an input rather than always-on because it needs a public repository and
  fails the publish outright otherwise.
- npm does the publishing, not Bun — `bun publish` has no provenance support.
- The workflow calls `bun run typecheck` per workspace instead of a turbo task, because the
  `check-types`/`typecheck` naming mismatch is still open question 4. Wiring it up here
  would have resolved that unilaterally.
- `.github/scripts/release-notes.ts` sits outside every `tsconfig.json`, so an editor shows
  unresolved `node:child_process` / `process` types for it. Nothing in CI typechecks it —
  `tsc --noEmit` runs per workspace and the script is in neither — and Bun supplies both at
  runtime. Adding a tsconfig for one script was judged worse than the stray diagnostic.
