/**
 * Dump the fully-resolved preview CSS for every theme.
 *
 * Used to prove that the design-token refactor is visually inert: `--draftly-*`
 * references are expanded back to the literal values they stand for, so the
 * output is comparable byte-for-byte against a pre-refactor snapshot.
 *
 * Usage: bun run scripts/theme-snapshot.ts <out-dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { allPlugins } from "../packages/draftly/src/plugins";
import { generateCSS } from "../packages/draftly/src/preview/css-generator";
import { ThemeEnum } from "../packages/draftly/src/editor/utils";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: theme-snapshot.ts <out-dir>");
mkdirSync(outDir, { recursive: true });

/** Collect `--token: value` declarations so `var()` references can be inlined. */
function collectTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of css.matchAll(/(--draftly-[\w-]+):\s*([^;}]+)/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/** Inline `var(--draftly-*)` references, including tokens defined via other tokens. */
function expand(css: string, tokens: Map<string, string>): string {
  let out = css;
  for (let pass = 0; pass < 5; pass++) {
    const next = out.replace(/var\((--draftly-[\w-]+)(?:,\s*([^()]*))?\)/g, (whole, name, fallback) => {
      const value = tokens.get(name);
      if (value !== undefined) return value;
      return fallback !== undefined ? fallback : whole;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Drop the token declarations themselves and normalise whitespace for diffing. */
function normalise(css: string): string {
  return css
    .replace(/--draftly-[\w-]+:\s*[^;}]+;?/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").replace(/\s*([{};:,])\s*/g, "$1").trim())
    .filter(Boolean)
    .sort()
    .join("\n");
}

for (const theme of [ThemeEnum.LIGHT, ThemeEnum.DARK, ThemeEnum.AUTO]) {
  const css = generateCSS({ plugins: allPlugins, theme });
  const resolved = normalise(expand(css, collectTokens(css)));
  writeFileSync(`${outDir}/${theme}.css`, `${resolved}\n`);
}

console.log(`wrote ${outDir}`);
