#!/usr/bin/env bun
/**
 * Build GitHub release notes from the conventional commits in a revision range.
 *
 * Replaced Changesets' changelog generation: the history already carries
 * `type(scope): Description` on every commit (AGENTS.md rule 5), so the notes are derived
 * rather than hand-maintained in a second place.
 *
 * Usage: `bun .github/scripts/release-notes.ts <version> <from-ref> [to-ref]`
 *
 * `from-ref` is exclusive and `to-ref` (default `HEAD`) inclusive, matching `git log A..B`.
 * The result goes to stdout so the caller can redirect it to a file for `gh release create`.
 */

import { execFileSync } from "node:child_process";

/** Separator between the subject and body of one commit, unlikely to occur in a message. */
const FIELD = "\u0001";

/** Separator between commits in `git log` output. */
const RECORD = "\u0002";

/**
 * Conventional-commit types in the order their sections appear, mapped to their headings.
 *
 * Keys match the types AGENTS.md sanctions. Anything else — including an unprefixed
 * subject — collects under "Other changes" rather than being dropped, because a release
 * note that silently omits a commit is worse than an untidy one.
 */
const SECTIONS: ReadonlyArray<readonly [type: string, heading: string]> = [
  ["feat", "### Features"],
  ["fix", "### Fixes"],
  ["perf", "### Performance"],
  ["refactor", "### Refactoring"],
  ["docs", "### Documentation"],
  ["chore", "### Chores"],
  ["other", "### Other changes"],
];

/** Commit types that are housekeeping only and are left out of the notes entirely. */
const SKIPPED_SCOPES = new Set(["release"]);

/** One commit, parsed into the pieces the notes need. */
interface Commit {
  /** Abbreviated hash, used to link the entry back to the commit. */
  readonly hash: string;
  /** Conventional-commit type, lowercased, or `"other"` when the subject has no prefix. */
  readonly type: string;
  /** Conventional-commit scope, or `undefined` when the subject carries none. */
  readonly scope?: string;
  /** Subject with the `type(scope):` prefix stripped. */
  readonly description: string;
  /** Whether the commit marks itself breaking, via `!` or a `BREAKING CHANGE:` footer. */
  readonly breaking: boolean;
}

/**
 * `type(scope)!: description`, with the scope and the breaking `!` both optional.
 *
 * Anchored and tolerant of the surrounding whitespace that `git log` subjects can carry.
 */
const SUBJECT = /^\s*(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:\s*(?<rest>.+?)\s*$/;

/**
 * Run `git` and return its stdout.
 *
 * @param args - Arguments passed to `git`
 * @returns The command's stdout, trailing newline trimmed
 */
function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trimEnd();
}

/**
 * Parse one `git log` record into a {@link Commit}.
 *
 * @param record - A `hash FIELD subject FIELD body` triple
 * @returns The parsed commit, or `null` for a record that should not appear in the notes
 */
function parse(record: string): Commit | null {
  const [hash, subject, body = ""] = record.split(FIELD);
  if (!hash || !subject) return null;

  // Merge commits describe the merge, not the change; the merged commits are in the range too.
  if (/^Merge (branch|pull request|remote-tracking)/.test(subject)) return null;

  const match = SUBJECT.exec(subject);
  const breaking = /^BREAKING[ -]CHANGE:/m.test(body);

  if (!match?.groups) {
    return { hash, type: "other", description: subject.trim(), breaking };
  }

  const { type, scope, rest } = match.groups;
  if (scope && SKIPPED_SCOPES.has(scope)) return null;

  return {
    hash,
    type: SECTIONS.some(([known]) => known === type) ? type : "other",
    scope: scope || undefined,
    description: rest,
    breaking: breaking || match.groups.breaking === "!",
  };
}

/**
 * Format one commit as a bullet: `- **scope:** Description (`hash`)`.
 *
 * @param commit - The commit to render
 * @returns A single markdown list item
 */
function bullet(commit: Commit): string {
  const scope = commit.scope ? `**${commit.scope}:** ` : "";
  return `- ${scope}${commit.description} (\`${commit.hash}\`)`;
}

/**
 * Collect the commits in `from..to` and render them as grouped markdown sections.
 *
 * @param from - Exclusive lower bound of the range
 * @param to - Inclusive upper bound of the range
 * @returns The notes body, without the heading, or a placeholder when the range is empty
 */
function notes(from: string, to: string): string {
  const log = git(["log", `${from}..${to}`, "--no-merges", `--format=%h${FIELD}%s${FIELD}%b${RECORD}`]);

  const commits = log
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map(parse)
    .filter((commit): commit is Commit => commit !== null);

  if (commits.length === 0) return "_No commits in this range._";

  const blocks: string[] = [];

  const breaking = commits.filter((commit) => commit.breaking);
  if (breaking.length > 0) {
    blocks.push(["### ⚠️ Breaking changes", "", ...breaking.map(bullet)].join("\n"));
  }

  for (const [type, heading] of SECTIONS) {
    const group = commits.filter((commit) => commit.type === type && !commit.breaking);
    if (group.length > 0) blocks.push([heading, "", ...group.map(bullet)].join("\n"));
  }

  return blocks.join("\n\n");
}

/**
 * Read `owner/repo` off the `origin` remote, for the links at the foot of the notes.
 *
 * Taken from the remote rather than `GITHUB_REPOSITORY` so the script produces the same
 * output when run by hand, and so Biome's `noUndeclaredEnvVars` rule stays satisfied
 * without declaring a CI-only variable in `turbo.json`.
 *
 * @returns The slug, or `"nexuls/draftly"` when the remote cannot be parsed
 */
function slug(): string {
  try {
    const url = git(["remote", "get-url", "origin"]);
    return /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url)?.[1] ?? "nexuls/draftly";
  } catch {
    return "nexuls/draftly";
  }
}

const [version, from, to = "HEAD"] = process.argv.slice(2);

if (!version || !from) {
  console.error("Usage: bun .github/scripts/release-notes.ts <version> <from-ref> [to-ref]");
  process.exit(1);
}

const body = notes(from, to);
const repository = slug();

process.stdout.write(
  [
    body,
    "",
    "---",
    "",
    `📦 [\`draftly@${version}\` on npm](https://www.npmjs.com/package/draftly/v/${version})`,
    `🔎 [Full diff](https://github.com/${repository}/compare/${from}...${to === "HEAD" ? `v${version}` : to})`,
    "",
  ].join("\n")
);
