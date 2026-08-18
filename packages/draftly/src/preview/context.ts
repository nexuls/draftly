import type { SyntaxNode } from "@lezer/common";
import type { Highlighter } from "@lezer/highlight";
import type { ThemeEnum } from "../editor/utils";
import type { PreviewContext } from "./types";
import DOMPurify from "dompurify";

/**
 * Whether the environment can run the bundled sanitizer.
 *
 * DOMPurify parses HTML with the DOM, so it is inert without one.
 */
function hasDOM(): boolean {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}

/**
 * Guard so the SSR warning is emitted once per process rather than once per node.
 *
 * A static-site build renders thousands of documents; a per-call warning would be
 * scrolled away rather than read.
 */
let warnedAboutMissingDOM = false;

/**
 * Warn that sanitization was requested and cannot be performed.
 *
 * Deliberately loud and deliberately actionable: this is a security-relevant default
 * that reads as safe and is not, and a code comment is not where a consumer looks.
 */
function warnSanitizationUnavailable(): void {
  if (warnedAboutMissingDOM) return;
  warnedAboutMissingDOM = true;

  console.warn(
    "[draftly] preview({ sanitize: true }) cannot sanitize outside a browser: DOMPurify " +
      "requires a DOM. HTML in this document is being emitted UNSANITIZED. Pass a " +
      "`sanitizer` option (for example isomorphic-dompurify), sanitize at the application " +
      "layer, or render on the client."
  );
}

/**
 * Creates a PreviewContext for rendering.
 *
 * @param doc - Full markdown source
 * @param theme - Theme the preview is being rendered for
 * @param renderChildren - Bound back to the renderer so plugins can recurse
 * @param sanitizeHtml - Whether HTML fragments should be sanitized at all
 * @param syntaxHighlighters - Highlighters available to code rendering
 * @param sanitizer - Consumer-supplied sanitizer, used in place of the bundled DOMPurify
 * @returns The context handed to every `renderToHTML` call
 */
export function createPreviewContext(
  doc: string,
  theme: ThemeEnum,
  renderChildren: (node: SyntaxNode) => Promise<string>,
  sanitizeHtml = true,
  syntaxHighlighters: readonly Highlighter[] = [],
  sanitizer?: (html: string) => string
): PreviewContext {
  return {
    doc,
    theme,
    syntaxHighlighters,

    sliceDoc(from: number, to: number): string {
      return doc.slice(from, to);
    },

    sanitize(html: string): string {
      // Opted out entirely -- the consumer has taken responsibility for the input.
      if (!sanitizeHtml) return html;

      // A supplied sanitizer wins: it is the only option that works everywhere, and
      // it is the documented answer for server-side rendering.
      if (sanitizer) return sanitizer(html);

      if (hasDOM()) return DOMPurify.sanitize(html);

      // Sanitization was asked for and cannot be delivered. Passing the HTML through
      // is what this has always done, so behaviour is unchanged -- but it now says so
      // instead of failing silently.
      warnSanitizationUnavailable();
      return html;
    },

    renderChildren,
  };
}
