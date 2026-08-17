import type { SyntaxNode } from "@lezer/common";
import type { Highlighter } from "@lezer/highlight";
import type { ThemeEnum } from "../editor/utils";
import type { PreviewContext } from "./types";
import DOMPurify from "dompurify";

/**
 * Creates a PreviewContext for rendering
 */
export function createPreviewContext(
  doc: string,
  theme: ThemeEnum,
  renderChildren: (node: SyntaxNode) => Promise<string>,
  sanitizeHtml = true,
  syntaxHighlighters: readonly Highlighter[] = []
): PreviewContext {
  return {
    doc,
    theme,
    syntaxHighlighters,

    sliceDoc(from: number, to: number): string {
      return doc.slice(from, to);
    },

    sanitize(html: string): string {
      if (!sanitizeHtml) return html;

      // DOMPurify works in browser; in Node, it needs jsdom
      if (typeof window !== "undefined") {
        return DOMPurify.sanitize(html);
      }

      // Server-side: return as-is (user should sanitize at application level)
      // or use isomorphic-dompurify in their setup
      return html;
    },

    renderChildren,
  };
}
