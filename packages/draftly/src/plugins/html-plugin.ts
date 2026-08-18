import { Decoration, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { type DecorationContext, DecorationPlugin } from "../editor/plugin";
import DOMPurify from "dompurify";
import { createTheme } from "../editor";
import { escapeHtml } from "../lib/escape-html";
import type { SyntaxNode } from "@lezer/common";

/**
 * Mark decorations for HTML content
 */
const htmlMarkDecorations = {
  "html-tag": Decoration.mark({ class: "cm-draftly-html-tag" }),
  "html-comment": Decoration.mark({ class: "cm-draftly-html-comment" }),
};

/**
 * Line decorations for HTML blocks (when visible)
 */
const htmlLineDecorations = {
  "html-block": Decoration.line({ class: "cm-draftly-line-html-block" }),
  "hidden-line": Decoration.line({ class: "cm-draftly-hidden-line" }),
};

/**
 * Widget to render sanitized HTML (block)
 */
class HTMLPreviewWidget extends WidgetType {
  constructor(readonly html: string) {
    super();
  }

  override eq(other: HTMLPreviewWidget): boolean {
    return other.html === this.html;
  }

  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-draftly-html-preview";
    div.innerHTML = DOMPurify.sanitize(this.html);
    return div;
  }

  override ignoreEvent() {
    return false;
  }
}

/**
 * Widget to render sanitized inline HTML
 */
class InlineHTMLPreviewWidget extends WidgetType {
  constructor(readonly html: string) {
    super();
  }

  override eq(other: InlineHTMLPreviewWidget): boolean {
    return other.html === this.html;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-draftly-inline-html-preview";
    span.innerHTML = DOMPurify.sanitize(this.html);
    return span;
  }

  override ignoreEvent() {
    return false;
  }
}

interface HTMLGroup {
  from: number;
  to: number;
}

interface HTMLTagInfo {
  from: number;
  to: number;
  tagName: string;
  isClosing: boolean;
  isSelfClosing: boolean;
}

interface InlineHTMLElement {
  from: number;
  to: number;
  content: string;
}

/**
 * Node names the markdown parser produces for raw HTML.
 *
 * Hoisted so `requiredNodes` and `renderToHTML` cannot drift apart. Confirmed against
 * the tree rather than guessed: `HTMLTag` for inline tags, `HTMLBlock` for a block,
 * `Comment` inline and `CommentBlock` at block level.
 */
const HTML_NODE_NAMES = ["HTMLBlock", "HTMLTag", "Comment", "CommentBlock"] as const;

/**
 * Sanitize a lone HTML tag for preview output, preserving its open/close role.
 *
 * `ctx.sanitize()` cannot be used directly here. DOMPurify parses a *fragment*, so it
 * balances what it is given: `<b>` comes back as `<b></b>` and `</b>` comes back as the
 * empty string. Feeding the parser's individual `HTMLTag` nodes through it would emit a
 * doubled opener and swallow every closer.
 *
 * So the tag is sanitized inside a balanced probe and the verdict is read off the
 * result. An allowed tag is re-emitted in its original role; a rejected one
 * (`<script>`, `<iframe>`, …) becomes the empty string. Attributes come from
 * DOMPurify's own filtering, so `onclick` and `javascript:` hrefs are dropped without
 * this function maintaining an allowlist of its own.
 *
 * @param raw - The tag exactly as written in the document, e.g. `<b class="x">`
 * @param sanitize - The preview context's sanitizer
 * @returns The tag to emit, or `""` if the tag is not allowed
 */
function sanitizeHTMLTag(raw: string, sanitize: (html: string) => string): string {
  const parsed = parseHTMLTag(raw);
  if (!parsed) {
    // Not a recognisable tag -- treat it as text rather than markup.
    return escapeHtml(raw);
  }

  const { tagName, isClosing } = parsed;

  if (isClosing) {
    // A closing tag carries no attributes; the only question is whether the element
    // is allowed at all. Probe with a balanced pair.
    return sanitize(`<${tagName}></${tagName}>`) === "" ? "" : raw;
  }

  const cleaned = sanitize(raw).trim();
  if (cleaned === "") {
    return "";
  }

  // DOMPurify closed the element for us; drop the closer it added so the document's
  // own closing tag stays the one that closes it.
  const closer = `</${tagName}>`;
  return cleaned.endsWith(closer) ? cleaned.slice(0, -closer.length) : cleaned;
}

/**
 * Parse an HTML tag to extract its name and type
 */
function parseHTMLTag(content: string): { tagName: string; isClosing: boolean; isSelfClosing: boolean } | null {
  const match = content.match(/^<\s*(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*(\/?)>$/);
  if (!match) return null;

  return {
    tagName: match[2]!.toLowerCase(),
    isClosing: match[1] === "/",
    isSelfClosing:
      match[3] === "/" ||
      ["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"].includes(
        match[2]!.toLowerCase()
      ),
  };
}

/**
 * HTMLPlugin - Decorates and Renders HTML in markdown
 */
export class HTMLPlugin extends DecorationPlugin {
  readonly name = "html";
  readonly version = "1.0.0";
  override decorationPriority = 30;
  override readonly requiredNodes = HTML_NODE_NAMES;

  constructor() {
    super();
  }

  /**
   * Plugin theme
   */
  override get theme() {
    return theme;
  }

  buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    const tree = syntaxTree(view.state);

    // Collect blocks and inline tags
    const htmlGroups: HTMLGroup[] = [];
    const htmlTags: HTMLTagInfo[] = [];

    tree.iterate({
      enter: (node) => {
        const { from, to, name } = node;

        // Handle HTML Comments
        if (name === "Comment") {
          decorations.push(htmlMarkDecorations["html-comment"].range(from, to));
          return;
        }

        // Collect inline HTML tags for pairing
        if (name === "HTMLTag") {
          const content = view.state.sliceDoc(from, to);
          const parsed = parseHTMLTag(content);
          if (parsed) {
            htmlTags.push({
              from,
              to,
              tagName: parsed.tagName,
              isClosing: parsed.isClosing,
              isSelfClosing: parsed.isSelfClosing,
            });
          }
        }

        // Handle HTML Blocks - Collect for grouping
        if (name === "HTMLBlock") {
          const last = htmlGroups[htmlGroups.length - 1];
          if (last) {
            const gap = view.state.sliceDoc(last.to, from);
            if (!gap.trim()) {
              last.to = to;
              return;
            }
          }
          htmlGroups.push({ from, to });
        }
      },
    });

    // Find complete inline HTML elements (must be on same line)
    const inlineElements: InlineHTMLElement[] = [];
    const usedTags = new Set<number>(); // Track used tag indices

    for (let i = 0; i < htmlTags.length; i++) {
      if (usedTags.has(i)) continue;

      const openTag = htmlTags[i]!;
      if (openTag.isClosing) continue;

      // Handle self-closing tags
      if (openTag.isSelfClosing) {
        inlineElements.push({
          from: openTag.from,
          to: openTag.to,
          content: view.state.sliceDoc(openTag.from, openTag.to),
        });
        usedTags.add(i);
        continue;
      }

      // Find matching closing tag (must be on same line)
      const openLine = view.state.doc.lineAt(openTag.from);
      let depth = 1;
      let closeTagIndex: number | null = null;

      for (let j = i + 1; j < htmlTags.length && depth > 0; j++) {
        const tag = htmlTags[j]!;

        // Stop if we've gone past the open tag's line
        if (tag.from > openLine.to) break;

        if (tag.tagName === openTag.tagName) {
          if (tag.isClosing) {
            depth--;
            if (depth === 0) {
              closeTagIndex = j;
            }
          } else if (!tag.isSelfClosing) {
            depth++;
          }
        }
      }

      if (closeTagIndex !== null) {
        const closeTag = htmlTags[closeTagIndex]!;
        inlineElements.push({
          from: openTag.from,
          to: closeTag.to,
          content: view.state.sliceDoc(openTag.from, closeTag.to),
        });

        // Mark all tags within this range as used (to handle nesting)
        for (let k = i; k <= closeTagIndex; k++) {
          usedTags.add(k);
        }
      }
    }

    // Sort by position and filter out overlapping elements (keep outermost)
    inlineElements.sort((a, b) => a.from - b.from);
    const filteredElements: InlineHTMLElement[] = [];
    let lastEnd = -1;

    for (const elem of inlineElements) {
      if (elem.from >= lastEnd) {
        filteredElements.push(elem);
        lastEnd = elem.to;
      }
    }

    // Apply decorations for inline elements
    for (const elem of filteredElements) {
      const cursorInRange = ctx.cursorInRange(elem.from, elem.to);

      if (cursorInRange) {
        // Show source - find and style the tags within this element
        for (const tag of htmlTags) {
          if (tag.from >= elem.from && tag.to <= elem.to) {
            decorations.push(htmlMarkDecorations["html-tag"].range(tag.from, tag.to));
          }
        }
      } else {
        // Render preview
        decorations.push(
          Decoration.replace({
            widget: new InlineHTMLPreviewWidget(elem.content),
          }).range(elem.from, elem.to)
        );
      }
    }

    // Style any remaining unprocessed tags (orphan tags)
    for (let i = 0; i < htmlTags.length; i++) {
      if (!usedTags.has(i)) {
        const tag = htmlTags[i]!;
        decorations.push(htmlMarkDecorations["html-tag"].range(tag.from, tag.to));
      }
    }

    // Process gathered HTML block groups
    for (const group of htmlGroups) {
      const { from, to } = group;

      const nodeLineStart = view.state.doc.lineAt(from);
      const nodeLineEnd = view.state.doc.lineAt(to);
      const cursorInRange = ctx.cursorInRange(nodeLineStart.from, nodeLineEnd.to);

      if (cursorInRange) {
        for (let i = nodeLineStart.number; i <= nodeLineEnd.number; i++) {
          const line = view.state.doc.line(i);
          decorations.push(htmlLineDecorations["html-block"].range(line.from));
        }
      } else {
        const htmlContent = view.state.sliceDoc(from, to);

        decorations.push(
          Decoration.replace({
            widget: new HTMLPreviewWidget(htmlContent.trim()),
          }).range(from, nodeLineStart.to)
        );

        for (let i = nodeLineStart.number + 1; i <= nodeLineEnd.number; i++) {
          const line = view.state.doc.line(i);
          decorations.push(htmlLineDecorations["hidden-line"].range(line.from));
        }
      }
    }
  }

  /**
   * Render raw HTML nodes to preview HTML.
   *
   * Without this the nodes reached the renderer's leaf fallback and were emitted
   * verbatim, so `<script>alert(1)</script>` written in a document became a live script
   * tag in the output regardless of the `sanitize` setting. This is the parity fix for
   * `HTMLPreviewWidget`, which has always sanitized on the editor surface.
   *
   * @param node - The syntax node to render
   * @param _children - Unused; HTML nodes are leaves as far as the markdown tree is concerned
   * @param ctx - Preview context, for `sliceDoc` and `sanitize`
   * @returns HTML to emit, or `null` to decline
   */
  override renderToHTML(
    node: SyntaxNode,
    _children: string,
    ctx: { sliceDoc(from: number, to: number): string; sanitize(html: string): string }
  ): string | null {
    switch (node.name) {
      case "HTMLBlock":
        // A block is a complete fragment, which is exactly what DOMPurify expects.
        return ctx.sanitize(ctx.sliceDoc(node.from, node.to));

      case "HTMLTag":
        return sanitizeHTMLTag(ctx.sliceDoc(node.from, node.to), (html) => ctx.sanitize(html));

      case "Comment":
      case "CommentBlock":
        // Comments render as nothing. Emitting them raw would be inert but would also
        // leak document source into the output for no benefit.
        return "";

      default:
        return null;
    }
  }
}

/**
 * Theme for HTML styling
 */
const theme = createTheme({
  default: {
    ".cm-draftly-html-tag": {
      color: "#6a737d",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
      fontSize: "0.85em",
    },

    ".cm-draftly-html-comment": {
      color: "#6a737d",
      fontStyle: "italic",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
      fontSize: "0.85em",
      opacity: 0.5,
    },

    ".cm-draftly-line-html-block": {
      backgroundColor: "rgba(0, 0, 0, 0.02)",
    },

    ".cm-draftly-hidden-line": {
      display: "none",
    },

    ".cm-draftly-html-preview": {
      display: "inline-block",
      width: "100%",
      verticalAlign: "top",
      margin: "0",
      whiteSpace: "normal",
      lineHeight: "1.4",
    },
    ".cm-draftly-html-preview > *:first-child": {
      marginTop: "0",
    },
    ".cm-draftly-html-preview > *:last-child": {
      marginBottom: "0",
    },

    ".cm-draftly-inline-html-preview": {
      display: "inline",
      whiteSpace: "normal",
    },
  },
});
