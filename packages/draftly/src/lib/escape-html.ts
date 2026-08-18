/**
 * HTML text escaping, shared by the preview renderer and by plugins building
 * markup in `renderToHTML`.
 *
 * Lives in `lib/` because it is pure text handling with no CodeMirror and no
 * preview-pipeline dependency, and because both surfaces need it. `preview/`
 * re-exports it, which is where it originally lived and where the public
 * `draftly/preview` export still points.
 *
 * @packageDocumentation
 */

/** The five characters that change meaning in HTML text or a quoted attribute value. */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Matcher for {@link HTML_ENTITIES}.
 *
 * Used only with `.replace()`. Never call `.test()` on it: a `/g` regex carries
 * `lastIndex` between calls, so a "does this need escaping?" fast path would silently
 * start matching from the wrong offset on the next invocation.
 */
const HTML_ESCAPE_PATTERN = /[&<>"']/g;

/**
 * Escape the five characters that change meaning inside HTML text or a quoted
 * attribute value.
 *
 * **This is not a substitute for sanitization, and sanitization is not a
 * substitute for this.** They solve different problems: escaping renders text
 * inert, sanitization scrubs a fragment that is meant to stay markup. Attribute
 * values and text content get escaped; an HTML fragment gets sanitized.
 *
 * @param text - Raw text to render inert
 * @returns The text with `&`, `<`, `>`, `"` and `'` replaced by entities
 *
 * @example
 * ```ts
 * `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
 * ```
 */
export function escapeHtml(text: string): string {
  // Single pass with a lookup. Chaining five `.replace` calls built four intermediate
  // strings per invocation, and this runs for every text gap in the document.
  return text.replace(HTML_ESCAPE_PATTERN, (char) => HTML_ENTITIES[char] as string);
}
