import { Decoration, type EditorView, type KeyBinding, WidgetType } from "@codemirror/view";
import { type DecorationContext, DecorationPlugin, type DescribedKeyBinding } from "../editor/plugin";
import { createTheme } from "../editor";
import { safeUrl } from "../lib/safe-url";
import { escapeHtml } from "../lib/escape-html";
import { resolveWidgetRange } from "../lib/widget-position";
import type { SyntaxNode } from "@lezer/common";

/**
 * Mark decorations for image syntax elements
 */
const imageMarkDecorations = {
  "image-block": Decoration.line({ class: "cm-draftly-image-block" }),
  "image-marker": Decoration.mark({ class: "cm-draftly-image-marker" }),
  "image-alt": Decoration.mark({ class: "cm-draftly-image-alt" }),
  "image-url": Decoration.mark({ class: "cm-draftly-image-url" }),
  "image-hidden": Decoration.mark({ class: "cm-draftly-image-hidden" }),
};

/**
 * Parse image markdown to extract alt text, URL, and optional title
 * Format: ![alt text](url "optional title")
 */
function parseImageMarkdown(content: string): { alt: string; url: string; title?: string } | null {
  // Regex to match: ![alt](url) or ![alt](url "title")
  const match = content.match(/^!\[([^\]]*)\]\(([^"\s)]+)(?:\s+"([^"]*)")?\s*\)$/);
  if (!match) return null;

  const result: { alt: string; url: string; title?: string } = {
    alt: match[1] || "",
    url: match[2]!,
  };

  if (match[3] !== undefined) {
    result.title = match[3];
  }

  return result;
}

/**
 * Widget to render an image with optional caption using figure/figcaption
 * Placed below the markdown syntax as a widget decoration
 */
class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
    readonly from: number,
    readonly to: number,
    readonly title?: string
  ) {
    super();
  }

  /**
   * Compares **content only**.
   *
   * `eq()` answers "can CodeMirror keep the DOM it already built?". Document positions
   * shift on any edit earlier in the document, so including them made the answer
   * permanently no -- every <img> below an edit was destroyed and re-created,
   * causing flicker and, depending on cache headers, a re-fetch. The handlers resolve the range from the live DOM instead.
   */
  override eq(other: ImageWidget): boolean {
    return other.url === this.url && other.alt === this.alt && other.title === this.title;
  }

  toDOM(view: EditorView) {
    // Create figure element for semantic image container
    const figure = document.createElement("figure");
    figure.className = "cm-draftly-image-figure";
    figure.setAttribute("role", "figure");
    figure.style.cursor = "pointer";
    // Fall back to the alt text: a figure with no accessible name is announced as an
    // unlabelled group, which is worse than repeating the image's own description.
    figure.setAttribute("aria-label", this.title || this.alt || "Image");

    // Click handler to select the raw markdown text
    figure.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const range = resolveWidgetRange(view, figure, ["Image"]) ?? { from: this.from, to: this.to };
      view.dispatch({
        selection: { anchor: range.from, head: range.to },
        scrollIntoView: true,
      });
      view.focus();
    });

    // Create image element with accessibility attributes
    const img = document.createElement("img");
    img.className = "cm-draftly-image";
    img.src = safeUrl(this.url, { allowDataImages: true });
    img.alt = this.alt;
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    if (this.title) {
      img.title = this.title;
    }

    // Handle image loading error. `onerror` can fire more than once for the same element
    // (re-decode, src reassignment), so appending unconditionally stacked duplicate
    // messages inside the figure.
    img.onerror = () => {
      img.style.display = "none";
      if (figure.querySelector(".cm-draftly-image-error")) return;

      const errorSpan = document.createElement("span");
      errorSpan.className = "cm-draftly-image-error";
      errorSpan.setAttribute("role", "alert");
      errorSpan.textContent = `[Image not found: ${this.alt || this.url}]`;
      figure.appendChild(errorSpan);
    };

    figure.appendChild(img);

    // Add figcaption if title exists
    if (this.title) {
      const figcaption = document.createElement("figcaption");
      figcaption.className = "cm-draftly-image-caption";
      figcaption.textContent = this.title;
      figure.appendChild(figcaption);
    }

    return figure;
  }

  override ignoreEvent(event: Event) {
    // Allow click events to be handled by our click handler
    return event.type !== "click";
  }
}

/**
 * ImagePlugin - Decorates and renders images in markdown
 *
 * Supports the full image syntax: ![alt text](url "optional title")
 * - Shows image widget below the node when cursor is not in range
 * - Hides the markdown syntax when cursor is not in range
 * - Shows raw markdown when cursor is in the image syntax
 * - Uses figure/figcaption for semantic HTML with accessibility attributes
 */
export class ImagePlugin extends DecorationPlugin {
  readonly name = "image";
  readonly version = "1.0.0";
  override decorationPriority = 25;
  override readonly requiredNodes = ["Image"] as const;

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
   * Keyboard shortcuts for image formatting
   */
  override getKeymap(): DescribedKeyBinding[] {
    return [
      {
        name: "Image",
        description: "Turn the selection into an image reference, or unwrap one",
        key: "Mod-Shift-i",
        run: (view) => this.toggleImage(view),
        preventDefault: true,
      },
    ];
  }

  /**
   * URL regex pattern
   */
  private readonly urlPattern = /^(https?:\/\/|www\.)[^\s]+$/i;

  /**
   * Toggle image on selection
   * - If text selected and is a URL: ![Alt Text](url) with cursor in brackets
   * - If text selected (not URL): ![text]() with cursor in parentheses
   * - If nothing selected: ![Alt Text]() with cursor in parentheses
   * - If already an image: remove syntax, leave just the URL
   */
  private toggleImage(view: EditorView): boolean {
    const { state } = view;
    const { from, to, empty } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);

    // Check if selection is already an image ![alt](url)
    const imageMatch = selectedText.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
    if (imageMatch) {
      // Already an image - extract just the URL and replace
      const imageUrl = imageMatch[2] || "";
      view.dispatch({
        changes: { from, to, insert: imageUrl },
        selection: { anchor: from, head: from + imageUrl.length },
      });
      return true;
    }

    // Check if we're inside an image by looking at surrounding context
    const lineStart = state.doc.lineAt(from).from;
    const lineEnd = state.doc.lineAt(to).to;
    const lineText = state.sliceDoc(lineStart, lineEnd);

    // Find image pattern in line that contains the selection
    const imageRegex = /!\[([^\]]*)\]\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = imageRegex.exec(lineText)) !== null) {
      const matchFrom = lineStart + match.index;
      const matchTo = matchFrom + match[0].length;

      // Check if selection is within this image
      if (from >= matchFrom && to <= matchTo) {
        // Remove the image syntax, leave just the URL
        const imageUrl = match[2] || "";
        view.dispatch({
          changes: { from: matchFrom, to: matchTo, insert: imageUrl },
          selection: { anchor: matchFrom, head: matchFrom + imageUrl.length },
        });
        return true;
      }
    }

    if (empty) {
      // No selection - insert ![Alt Text]() and place cursor in parentheses
      const defaultAlt = "Alt Text";
      const newText = `![${defaultAlt}]()`;
      view.dispatch({
        changes: { from, insert: newText },
        selection: { anchor: from + defaultAlt.length + 4 }, // After ![Alt Text](
      });
    } else if (this.urlPattern.test(selectedText)) {
      // Selected text is a URL - put it in parentheses with default alt text
      const defaultAlt = "Alt Text";
      const newText = `![${defaultAlt}](${selectedText})`;
      view.dispatch({
        changes: { from, to, insert: newText },
        selection: { anchor: from + 2, head: from + 2 + defaultAlt.length }, // Select "Alt Text"
      });
    } else {
      // Selected text is not a URL - use as alt text, cursor in parentheses
      const newText = `![${selectedText}]()`;
      view.dispatch({
        changes: { from, to, insert: newText },
        selection: { anchor: from + selectedText.length + 4 }, // After ![text](
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

        // Handle Image nodes
        if (name === "Image") {
          const content = view.state.sliceDoc(from, to);
          const parsed = parseImageMarkdown(content);

          if (!parsed) return;

          const cursorInRange = ctx.selectionOverlapsRange(from, to);

          // Add line decoration for image
          decorations.push(imageMarkDecorations["image-block"].range(from));

          // Always add the image widget below the node
          decorations.push(
            Decoration.widget({
              widget: new ImageWidget(parsed.url, parsed.alt, from, to, parsed.title),
              side: 1, // Place after the position
              block: false, // Don't create a new line
            }).range(to)
          );

          if (cursorInRange) {
            // Cursor in range: show raw markdown with styling
            this.decorateRawImage(node.node, decorations, view);
          } else {
            // Cursor out of range: hide the raw markdown text
            decorations.push(imageMarkDecorations["image-hidden"].range(from, to));
          }
        }
      },
    });
  }

  /**
   * Decorate raw image markdown when cursor is in range
   */
  private decorateRawImage(
    node: SyntaxNode,
    decorations: import("@codemirror/state").Range<Decoration>[],
    view: import("@codemirror/view").EditorView
  ): void {
    // Find and style child nodes
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "URL") {
        decorations.push(imageMarkDecorations["image-url"].range(child.from, child.to));
      }
    }

    // Style the markers (! [ ] ( ))
    const content = view.state.sliceDoc(node.from, node.to);
    const bangBracket = node.from; // Position of !
    if (content.startsWith("![")) {
      decorations.push(imageMarkDecorations["image-marker"].range(bangBracket, bangBracket + 2));
    }

    // Find and style closing bracket and parentheses
    const altEnd = content.indexOf("](");
    if (altEnd !== -1) {
      const altStart = 2;
      // Style alt text
      if (altEnd > altStart) {
        decorations.push(imageMarkDecorations["image-alt"].range(node.from + altStart, node.from + altEnd));
      }
      // Style ]( markers
      decorations.push(imageMarkDecorations["image-marker"].range(node.from + altEnd, node.from + altEnd + 2));
      // Style closing )
      decorations.push(imageMarkDecorations["image-marker"].range(node.to - 1, node.to));
    }
  }

  /**
   * Render image to HTML for preview mode using figure/figcaption
   */
  override renderToHTML(
    node: SyntaxNode,
    _children: string,
    ctx: { sliceDoc(from: number, to: number): string; sanitize(html: string): string }
  ): string | null {
    if (node.name !== "Image") return null;

    const content = ctx.sliceDoc(node.from, node.to);
    const parsed = parseImageMarkdown(content);
    if (!parsed) return null;

    // Escape, do not sanitize -- see the note in LinkPlugin.renderToHTML. `data:`
    // image URLs are allowed here and only here; they are a real markdown idiom
    // for an `<img src>` and meaningless for a navigation target.
    const altAttr = escapeHtml(parsed.alt);
    const srcAttr = escapeHtml(safeUrl(parsed.url, { allowDataImages: true }));
    const titleAttr = parsed.title ? ` title="${escapeHtml(parsed.title)}"` : "";
    const ariaLabel = parsed.title ? ` aria-label="${escapeHtml(parsed.title)}"` : "";

    let html = `<figure class="cm-draftly-image-figure" role="figure"${ariaLabel}>`;
    html += `<img class="cm-draftly-image" src="${srcAttr}" alt="${altAttr}"${titleAttr} loading="lazy" decoding="async" />`;

    if (parsed.title) {
      html += `<figcaption class="cm-draftly-image-caption">${escapeHtml(parsed.title)}</figcaption>`;
    }

    html += "</figure>";
    return html;
  }
}

/**
 * Theme for image styling
 */
const theme = createTheme({
  default: {
    ".cm-draftly-image-block br": {
      display: "none",
    },

    // Image markers (! [ ] ( ))
    ".cm-draftly-image-marker": {
      color: "var(--draftly-color-muted)",
      fontFamily: "var(--draftly-font-mono)",
    },

    // Alt text
    ".cm-draftly-image-alt": {
      color: "var(--draftly-color-success)",
      fontStyle: "italic",
    },

    // URL
    ".cm-draftly-image-url": {
      color: "var(--draftly-color-link)",
      textDecoration: "underline",
    },

    // Hidden markdown syntax (when cursor is not in range)
    ".cm-draftly-image-hidden": {
      display: "none",
    },

    // Figure container
    ".cm-draftly-image-figure": {
      display: "flex",
      flexDirection: "column",
      alignItems: "start",
      maxWidth: "100%",
      padding: "0",
    },

    // Image element
    ".cm-draftly-image": {
      maxWidth: "100%",
      maxHeight: "800px",
      height: "auto",
      borderRadius: "4px",
    },

    // Figcaption
    ".cm-draftly-image-caption": {
      display: "block",
      width: "100%",
      fontSize: "0.875em",
      color: "var(--draftly-color-muted)",
      marginTop: "0.5em",
      textAlign: "center",
      fontStyle: "italic",
    },

    // Error state
    ".cm-draftly-image-error": {
      display: "inline-block",
      padding: "0.5em 1em",
      backgroundColor: "var(--draftly-color-error-surface)",
      color: "var(--draftly-color-danger)",
      borderRadius: "4px",
      fontSize: "0.875em",
      fontStyle: "italic",
    },
  },
});
