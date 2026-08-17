import { Decoration, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { type DecorationContext, DecorationPlugin } from "../editor/plugin";
import DOMPurify from "dompurify";
import { createTheme } from "../editor";

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
