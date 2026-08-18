/**
 * Scope flat CSS under a wrapper selector.
 *
 * Preview CSS is emitted into the host page's global stylesheet, so any rule that
 * is not scoped to the preview wrapper also applies to the editor — which is how
 * the preview's syntax theme used to restyle `.cm-draftly` content.
 *
 * A regex over `{` boundaries is not sufficient: it descends into `@keyframes`
 * (whose `from`/`to` steps are not selectors) and skips the selectors nested
 * inside `@media`. This scanner tracks brace depth, ignores braces inside strings
 * and comments, and treats each at-rule according to whether its body contains
 * style rules or something else.
 */

/**
 * At-rules whose body is a list of ordinary style rules, so recursing into them
 * and scoping their selectors is correct. Everything else at-rule shaped is
 * emitted untouched.
 */
const NESTED_STYLE_AT_RULES = /^@(?:media|supports|container|layer|scope|document)\b/i;

/**
 * Selectors that address the document root. Under a wrapper they can never match,
 * so they collapse onto the wrapper itself — which is the element that plays the
 * role of "root" for preview output, and where custom properties want to land.
 */
const ROOT_SELECTORS = new Set([":root", "html", "body"]);

/**
 * Prefix every style rule in `css` with `.wrapperClass`.
 *
 * @param css - Flat CSS text, typically from `StyleModule.getRules()`
 * @param wrapperClass - Wrapper class name, without the leading dot
 * @returns The same CSS with every selector scoped to the wrapper
 *
 * @example
 * ```ts
 * scopeCssToWrapper(".tok-keyword { color: red }", "draftly-preview");
 * // ".draftly-preview .tok-keyword { color: red }"
 * ```
 */
export function scopeCssToWrapper(css: string, wrapperClass: string): string {
  if (!css || !wrapperClass) return css;
  return scopeBlocks(css, `.${wrapperClass}`);
}

/**
 * Walk a sequence of CSS blocks, scoping style-rule selectors and recursing into
 * conditional at-rules.
 *
 * @param css - CSS text at one nesting level
 * @param prefix - Wrapper selector, including its leading dot
 * @returns The rewritten CSS
 */
function scopeBlocks(css: string, prefix: string): string {
  let out = "";
  let cursor = 0;

  while (cursor < css.length) {
    const open = findSignificant(css, cursor, "{");
    if (open === -1) {
      out += css.slice(cursor);
      break;
    }

    const close = findBlockEnd(css, open);
    const prelude = css.slice(cursor, open);
    const body = css.slice(open + 1, close);

    // A prelude may carry statements (`@import …;`) ahead of the actual selector.
    const lastSemicolon = prelude.lastIndexOf(";");
    const leading = lastSemicolon === -1 ? "" : prelude.slice(0, lastSemicolon + 1);
    const selectorText = (lastSemicolon === -1 ? prelude : prelude.slice(lastSemicolon + 1)).trim();

    out += leading;

    if (selectorText.startsWith("@")) {
      const inner = NESTED_STYLE_AT_RULES.test(selectorText) ? scopeBlocks(body, prefix) : body;
      out += `\n${selectorText} {${inner}}`;
    } else {
      out += `\n${scopeSelectorList(selectorText, prefix)} {${body}}`;
    }

    cursor = close + 1;
  }

  return out;
}

/**
 * Scope one comma-separated selector list.
 *
 * @param selectorText - Raw selector list from the source CSS
 * @param prefix - Wrapper selector, including its leading dot
 * @returns The scoped selector list, or the original when it is empty
 */
function scopeSelectorList(selectorText: string, prefix: string): string {
  const scoped = splitSelectors(selectorText)
    .map((selector) => (ROOT_SELECTORS.has(selector) ? prefix : `${prefix} ${selector}`))
    .join(", ");

  return scoped || selectorText;
}

/**
 * Split a selector list on top-level commas only, so `:is(a, b)` and `[x=","]`
 * survive intact.
 *
 * @param selectorText - Raw selector list
 * @returns Trimmed, non-empty individual selectors
 */
function splitSelectors(selectorText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < selectorText.length; i++) {
    const char = selectorText[i];
    if (char === '"' || char === "'") {
      i = skipString(selectorText, i);
    } else if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth--;
    } else if (char === "," && depth === 0) {
      parts.push(selectorText.slice(start, i).trim());
      start = i + 1;
    }
  }

  parts.push(selectorText.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * Find the index of `target` at the current nesting level, skipping over strings
 * and comments.
 *
 * @param css - CSS text to scan
 * @param from - Index to start scanning at
 * @param target - Single character to look for
 * @returns The index, or `-1` if it does not occur
 */
function findSignificant(css: string, from: number, target: string): number {
  for (let i = from; i < css.length; i++) {
    const char = css[i];
    if (char === "/" && css[i + 1] === "*") {
      i = skipComment(css, i);
    } else if (char === '"' || char === "'") {
      i = skipString(css, i);
    } else if (char === target) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the `}` that closes the block opened at `openIndex`.
 *
 * @param css - CSS text to scan
 * @param openIndex - Index of the opening `{`
 * @returns Index of the matching `}`, or the end of the string if unbalanced
 */
function findBlockEnd(css: string, openIndex: number): number {
  let depth = 0;

  for (let i = openIndex; i < css.length; i++) {
    const char = css[i];
    if (char === "/" && css[i + 1] === "*") {
      i = skipComment(css, i);
    } else if (char === '"' || char === "'") {
      i = skipString(css, i);
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return css.length;
}

/**
 * @param css - CSS text to scan
 * @param start - Index of the opening quote
 * @returns Index of the closing quote, or the last index if unterminated
 */
function skipString(css: string, start: number): number {
  const quote = css[start];
  for (let i = start + 1; i < css.length; i++) {
    if (css[i] === "\\") {
      i++;
    } else if (css[i] === quote) {
      return i;
    }
  }
  return css.length - 1;
}

/**
 * @param css - CSS text to scan
 * @param start - Index of the opening `/` of a `/* *\/` comment
 * @returns Index of the closing `/`, or the last index if unterminated
 */
function skipComment(css: string, start: number): number {
  const end = css.indexOf("*/", start + 2);
  return end === -1 ? css.length - 1 : end + 1;
}
