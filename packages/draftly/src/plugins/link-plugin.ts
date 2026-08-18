import { Decoration, type EditorView, type KeyBinding, WidgetType } from "@codemirror/view";
import { type DecorationContext, DecorationPlugin } from "../editor/plugin";
import { createTheme } from "../editor";
import { safeUrl } from "../lib/safe-url";
import { escapeHtml } from "../lib/escape-html";
import type { SyntaxNode } from "@lezer/common";

/**
 * Mark decorations for link syntax elements
 */
const linkMarkDecorations = {
  "link-text": Decoration.mark({ class: "cm-draftly-link-text" }),
  "link-marker": Decoration.mark({ class: "cm-draftly-link-marker" }),
  "link-url": Decoration.mark({ class: "cm-draftly-link-url" }),
  "link-hidden": Decoration.mark({ class: "cm-draftly-link-hidden" }),
};

/**
 * Parse link markdown to extract text and URL
 * Format: [text](url) or [text](url "title")
 */
function parseLinkMarkdown(content: string): { text: string; url: string; title?: string } | null {
  // Regex to match: [text](url) or [text](url "title")
  const match = content.match(/^\[([^\]]*)\]\(([^"\s)]+)(?:\s+"([^"]*)")?\s*\)$/);
  if (!match) return null;

  const result: { text: string; url: string; title?: string } = {
    text: match[1] || "",
    url: match[2]!,
  };

  if (match[3] !== undefined) {
    result.title = match[3];
  }

  return result;
}

/**
 * Widget for displaying a tooltip with the link URL on hover
 */
class LinkTooltipWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  override eq(other: LinkTooltipWidget): boolean {
    return other.url === this.url && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-draftly-link-wrapper";
    wrapper.style.cursor = "pointer";

    // Tooltip element
    const tooltip = document.createElement("span");
    tooltip.className = "cm-draftly-link-tooltip";
    tooltip.textContent = this.url;
    wrapper.appendChild(tooltip);

    // Show/hide tooltip on hover
    wrapper.addEventListener("mouseenter", () => {
      tooltip.classList.add("cm-draftly-link-tooltip-visible");
    });

    wrapper.addEventListener("mouseleave", () => {
      tooltip.classList.remove("cm-draftly-link-tooltip-visible");
    });

    // Click handler - select the raw markdown
    wrapper.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Click: open in new tab
        e.preventDefault();
        e.stopPropagation();
        const target = safeUrl(this.url);
        if (target) {
          window.open(target, "_blank", "noopener,noreferrer");
        }
      } else {
        // Regular click: select raw markdown
        e.preventDefault();
        e.stopPropagation();
        view.dispatch({
          selection: { anchor: this.from, head: this.to },
          scrollIntoView: true,
        });
        view.focus();
      }
    });

    return wrapper;
  }

  override ignoreEvent(event: Event): boolean {
    // Allow click and mouse events to be handled by our handlers
    return event.type !== "click" && event.type !== "mouseenter" && event.type !== "mouseleave";
  }
}

/**
 * LinkPlugin - Decorates and provides interactivity for markdown links
 *
 * Supports the full link syntax: [text](url) and [text](url "title")
 * - Click: reveals raw markdown (selects/focuses the link syntax)
 * - Ctrl+Click: opens the link URL in a new browser tab
 * - Hover: shows tooltip with the link URL
 * - Hides the markdown syntax when cursor is not in range
 * - Shows raw markdown when cursor is within the link range
 */
export class LinkPlugin extends DecorationPlugin {
  readonly name = "link";
  readonly version = "1.0.0";
  override decorationPriority = 22;
  override readonly requiredNodes = ["Link"] as const;

  constructor() {
    super();
  }

  /**
   * Plugin theme
   */
  override get theme() {
    return theme;
  }

  /**
   * Keyboard shortcuts for link formatting
   */
  override getKeymap(): KeyBinding[] {
    return [
      {
        key: "Mod-k",
        run: (view) => this.toggleLink(view),
        preventDefault: true,
      },
    ];
  }

  /**
   * URL regex pattern
   */
  private readonly urlPattern = /^(https?:\/\/|www\.)[^\s]+$/i;

  /**
   * Toggle link on selection
   * - If text is selected and is a URL: [](url) with cursor in brackets
   * - If text is selected (not URL): [text]() with cursor in parentheses
   * - If nothing selected: []() with cursor in brackets
   * - If already a link: remove syntax, leave plain text
   */
  private toggleLink(view: EditorView): boolean {
    const { state } = view;
    const { from, to, empty } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);

    // Check if selection is already a link [text](url)
    const linkMatch = selectedText.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
    if (linkMatch) {
      // Already a link - extract just the text and replace
      const linkText = linkMatch[1] || "";
      view.dispatch({
        changes: { from, to, insert: linkText },
        selection: { anchor: from, head: from + linkText.length },
      });
      return true;
    }

    // Check if we're inside a link by looking at surrounding context
    const lineStart = state.doc.lineAt(from).from;
    const lineEnd = state.doc.lineAt(to).to;
    const lineText = state.sliceDoc(lineStart, lineEnd);

    // Find link pattern in line that contains the selection
    const linkRegex = /\[([^\]]*)\]\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(lineText)) !== null) {
      const matchFrom = lineStart + match.index;
      const matchTo = matchFrom + match[0].length;

      // Check if selection is within this link
      if (from >= matchFrom && to <= matchTo) {
        // Remove the link syntax, leave plain text
        const linkText = match[1] || "";
        view.dispatch({
          changes: { from: matchFrom, to: matchTo, insert: linkText },
          selection: { anchor: matchFrom, head: matchFrom + linkText.length },
        });
        return true;
      }
    }

    if (empty) {
      // No selection - insert []() and place cursor in brackets
      view.dispatch({
        changes: { from, insert: "[]()" },
        selection: { anchor: from + 1 },
      });
    } else if (this.urlPattern.test(selectedText)) {
      // Selected text is a URL - put it in parentheses, cursor in brackets
      const newText = `[](${selectedText})`;
      view.dispatch({
        changes: { from, to, insert: newText },
        selection: { anchor: from + 1 },
      });
    } else {
      // Selected text is not a URL - wrap as link text, cursor in parentheses
      const newText = `[${selectedText}]()`;
      view.dispatch({
        changes: { from, to, insert: newText },
        selection: { anchor: from + selectedText.length + 3 },
      });
    }

    return true;
  }

  buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    // Scoped to the viewport: an unbounded walk makes every update -- including a
    // plain cursor move -- cost O(document). See DecorationContext.iterateVisible.
    ctx.iterateVisible({
      enter: (node) => {
        const { from, to, name } = node;

        // Handle Link nodes
        if (name === "Link") {
          const content = view.state.sliceDoc(from, to);
          const parsed = parseLinkMarkdown(content);

          if (!parsed) return;

          const cursorInRange = ctx.selectionOverlapsRange(from, to);

          if (cursorInRange) {
            // Cursor in range: show raw markdown with styling
            this.decorateRawLink(node.node, decorations, view);
          } else {
            // Cursor out of range: hide raw markdown, show styled link text
            // Hide the entire markdown syntax
            decorations.push(linkMarkDecorations["link-hidden"].range(from, to));

            // Add styled link text with tooltip widget after the hidden markdown
            decorations.push(
              Decoration.widget({
                widget: new LinkTooltipWidget(parsed.url, from, to),
                side: 1,
              }).range(to)
            );

            // Add replacement decoration to show styled link text
            decorations.push(
              Decoration.replace({
                widget: new LinkTextWidget(parsed.text, parsed.url, from, to, parsed.title),
              }).range(from, to)
            );
          }
        }
      },
    });
  }

  /**
   * Decorate raw link markdown when cursor is in range
   */
  private decorateRawLink(
    node: SyntaxNode,
    decorations: import("@codemirror/state").Range<Decoration>[],
    view: import("@codemirror/view").EditorView
  ): void {
    const content = view.state.sliceDoc(node.from, node.to);

    // Style the opening bracket [
    decorations.push(linkMarkDecorations["link-marker"].range(node.from, node.from + 1));

    // Find and style the link text and closing bracket + opening paren ](
    const bracketParen = content.indexOf("](");
    if (bracketParen !== -1) {
      // Style link text
      if (bracketParen > 1) {
        decorations.push(linkMarkDecorations["link-text"].range(node.from + 1, node.from + bracketParen));
      }
      // Style ]( markers
      decorations.push(
        linkMarkDecorations["link-marker"].range(node.from + bracketParen, node.from + bracketParen + 2)
      );

      // Find and style the URL
      const urlChild = node.getChild("URL");
      if (urlChild) {
        decorations.push(linkMarkDecorations["link-url"].range(urlChild.from, urlChild.to));
      }

      // Style closing )
      decorations.push(linkMarkDecorations["link-marker"].range(node.to - 1, node.to));
    }
  }

  /**
   * Render link to HTML for preview mode
   */
  override renderToHTML(
    node: SyntaxNode,
    _children: string,
    ctx: { sliceDoc(from: number, to: number): string; sanitize(html: string): string }
  ): string | null {
    if (node.name !== "Link") return null;

    const content = ctx.sliceDoc(node.from, node.to);
    const parsed = parseLinkMarkdown(content);
    if (!parsed) return null;

    // Attribute values are *text*, so they are escaped, not sanitized. DOMPurify
    // sanitizes an HTML fragment; handed a bare string it returns it essentially
    // unchanged -- quotes included -- which is how `[x](" onmouseover="alert(1))`
    // used to inject an attribute here.
    const textContent = escapeHtml(parsed.text);
    const urlAttr = escapeHtml(safeUrl(parsed.url));
    const titleAttr = parsed.title ? ` title="${escapeHtml(parsed.title)}"` : "";

    return `<a class="cm-draftly-link" href="${urlAttr}"${titleAttr} target="_blank" rel="noopener noreferrer">${textContent}</a>`;
  }
}

/**
 * Widget to display the styled link text with interactivity
 */
class LinkTextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly url: string,
    readonly from: number,
    readonly to: number,
    readonly title?: string
  ) {
    super();
  }

  override eq(other: LinkTextWidget): boolean {
    return (
      other.text === this.text &&
      other.url === this.url &&
      other.from === this.from &&
      other.to === this.to &&
      other.title === this.title
    );
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-draftly-link-styled";
    span.textContent = this.text;
    span.style.cursor = "pointer";

    if (this.title) {
      span.title = this.title;
    }

    // Tooltip element
    const tooltip = document.createElement("span");
    tooltip.className = "cm-draftly-link-tooltip";
    tooltip.textContent = this.url;
    span.appendChild(tooltip);

    // Show/hide tooltip on hover
    span.addEventListener("mouseenter", () => {
      tooltip.classList.add("cm-draftly-link-tooltip-visible");
    });

    span.addEventListener("mouseleave", () => {
      tooltip.classList.remove("cm-draftly-link-tooltip-visible");
    });

    // Click handler
    span.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Click: open in new tab
        e.preventDefault();
        e.stopPropagation();
        const target = safeUrl(this.url);
        if (target) {
          window.open(target, "_blank", "noopener,noreferrer");
        }
      } else {
        // Regular click: select raw markdown
        e.preventDefault();
        e.stopPropagation();
        view.dispatch({
          selection: { anchor: this.from, head: this.to },
          scrollIntoView: true,
        });
        view.focus();
      }
    });

    return span;
  }

  override ignoreEvent(event: Event): boolean {
    // Allow click and mouse events to be handled by our handlers
    return event.type !== "click" && event.type !== "mouseenter" && event.type !== "mouseleave";
  }
}

/**
 * Theme for link styling
 */
const theme = createTheme({
  default: {
    // Link text
    ".cm-draftly-link-text": {
      color: "#0366d6",
    },

    // Link markers ([ ] ( ))
    ".cm-draftly-link-marker": {
      color: "#6a737d",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
    },

    // URL in raw markdown
    ".cm-draftly-link-url": {
      color: "#6a737d",
      fontStyle: "italic",
    },

    // Hidden markdown syntax
    ".cm-draftly-link-hidden": {
      display: "none",
    },

    // Styled link when cursor is not in range
    ".cm-draftly-link-styled": {
      color: "#0366d6",
      textDecoration: "underline",
      position: "relative",
      cursor: "pointer",
    },

    ".cm-draftly-link-styled:hover": {
      color: "#0056b3",
    },

    // Preview link styling
    ".cm-draftly-link": {
      color: "#0366d6",
      textDecoration: "underline",
    },

    ".cm-draftly-link:hover": {
      color: "#0056b3",
    },

    // Tooltip styling
    ".cm-draftly-link-tooltip": {
      display: "none",
      position: "absolute",
      bottom: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: "#24292e",
      color: "#ffffff",
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "12px",
      whiteSpace: "nowrap",
      zIndex: "1000",
      pointerEvents: "none",
      marginBottom: "4px",
      maxWidth: "300px",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },

    ".cm-draftly-link-tooltip-visible": {
      display: "block",
    },
  },

  dark: {
    ".cm-draftly-link-text": {
      color: "#58a6ff",
    },

    ".cm-draftly-link-marker": {
      color: "#8b949e",
    },

    ".cm-draftly-link-url": {
      color: "#8b949e",
    },

    ".cm-draftly-link-styled": {
      color: "#58a6ff",
    },

    ".cm-draftly-link-styled:hover": {
      color: "#79c0ff",
    },

    ".cm-draftly-link": {
      color: "#58a6ff",
    },

    ".cm-draftly-link:hover": {
      color: "#79c0ff",
    },

    ".cm-draftly-link-tooltip": {
      backgroundColor: "#30363d",
      color: "#c9d1d9",
    },
  },
});
