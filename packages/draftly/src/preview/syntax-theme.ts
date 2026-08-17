import { classHighlighter, type Highlighter } from "@lezer/highlight";
import type { SyntaxThemeInput } from "./types";

type HighlightSpec = {
  tag?: unknown;
  class?: string;
  [key: string]: unknown;
};

type RuntimeHighlightStyle = {
  specs?: HighlightSpec[];
  style?: (tags: readonly import("@lezer/highlight").Tag[]) => string | null;
  module?: { getRules(): string } | null;
};

const MAX_WALK_DEPTH = 8;

/**
 * Extract syntax highlight CSS from resolved CodeMirror HighlightStyle modules.
 */
export function generateSyntaxThemeCSS(
  syntaxTheme: SyntaxThemeInput | SyntaxThemeInput[] | undefined,
  _wrapperClass: string
): string {
  if (!syntaxTheme) return "";

  const styles = extractRuntimeHighlightStyles(syntaxTheme);
  if (!styles.length) return "";

  const cssChunks: string[] = [];

  for (const style of styles) {
    const rules = style.module?.getRules();
    if (!rules) continue;
    cssChunks.push(rules);
  }

  if (!cssChunks.length) return "";

  return Array.from(new Set(cssChunks)).join("\n");
}

export function resolveSyntaxHighlighters(
  syntaxTheme: SyntaxThemeInput | SyntaxThemeInput[] | undefined,
  includeLegacyClassHighlighter = true
): readonly Highlighter[] {
  const resolved: Highlighter[] = [];
  if (includeLegacyClassHighlighter) {
    resolved.push(classHighlighter);
  }

  const styles = extractRuntimeHighlightStyles(syntaxTheme);
  for (const style of styles) {
    if (typeof style.style === "function") {
      resolved.push(style as unknown as Highlighter);
    }
  }

  return Array.from(new Set(resolved));
}

function extractRuntimeHighlightStyles(
  input: SyntaxThemeInput | SyntaxThemeInput[] | undefined
): RuntimeHighlightStyle[] {
  if (!input) return [];

  const values = Array.isArray(input) ? input : [input];
  const styles: RuntimeHighlightStyle[] = [];
  const visited = new WeakSet<object>();

  for (const value of values) {
    walk(value, 0, visited, styles);
  }

  return styles;
}

function walk(value: unknown, depth: number, visited: WeakSet<object>, out: RuntimeHighlightStyle[]): void {
  if (value === null || value === undefined) return;
  if (depth > MAX_WALK_DEPTH) return;

  if (isRuntimeHighlightStyle(value)) {
    out.push(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, depth + 1, visited, out);
    }
    return;
  }

  if (typeof value !== "object") return;
  if (visited.has(value)) return;
  visited.add(value);

  const keys = Object.getOwnPropertyNames(value);
  for (const key of keys) {
    try {
      walk((value as Record<string, unknown>)[key], depth + 1, visited, out);
    } catch {
      // Ignore inaccessible properties
    }
  }
}

function isRuntimeHighlightStyle(value: unknown): value is RuntimeHighlightStyle {
  if (!value || typeof value !== "object") return false;
  const style = value as RuntimeHighlightStyle;
  return Array.isArray(style.specs) && typeof style.style === "function";
}
