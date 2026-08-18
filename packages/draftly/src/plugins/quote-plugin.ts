import { Decoration } from "@codemirror/view";
import { type DecorationContext, DecorationPlugin } from "../editor/plugin";
import { createTheme } from "../editor";
import type { SyntaxNode } from "@lezer/common";

/**
 * Mark decorations for blockquote elements
 */
const quoteMarkDecorations = {
  /** Decoration for the > marker */
  "quote-mark": Decoration.replace({}),
  /** Decoration for the quote content */
  "quote-content": Decoration.mark({ class: "cm-draftly-quote-content" }),
};

/**
 * Line decorations for blockquote lines
 */
const quoteLineDecorations = {
  /** Decoration for blockquote lines */
  "quote-line": Decoration.line({ class: "cm-draftly-quote-line" }),
};

/**
 * QuotePlugin - Decorates markdown blockquotes
 *
 * Adds visual styling to blockquotes (> prefixed lines)
 * - Line decorations for indicating quote blocks with a left border
 * - Mark decorations for quote content
 * - Hides > markers when cursor is not in the blockquote
 */
export class QuotePlugin extends DecorationPlugin {
  readonly name = "quote";
  readonly version = "1.0.0";
  override decorationPriority = 10;
  override readonly requiredNodes = ["Blockquote", "QuoteMark"] as const;

  /**
   * Constructor - calls super constructor
   */
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
   * Build blockquote decorations by iterating the syntax tree
   */
  buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    // Scoped to the viewport: an unbounded walk makes every update -- including a
    // plain cursor move -- cost O(document). See DecorationContext.iterateVisible.
    ctx.iterateVisible({
      enter: (node) => {
        const { from, to, name } = node;

        if (name !== "Blockquote") {
          return;
        }

        // Process each line within the blockquote
        const startLine = view.state.doc.lineAt(from);
        const endLine = view.state.doc.lineAt(to);

        for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
          const line = view.state.doc.line(lineNum);

          // Add line decoration for the blockquote border
          decorations.push(quoteLineDecorations["quote-line"].range(line.from));
        }

        // Add mark decoration for the entire blockquote content
        decorations.push(quoteMarkDecorations["quote-content"].range(from, to));

        // Hide quote markers when cursor is not in the blockquote
        const cursorInNode = ctx.selectionOverlapsRange(from, to);
        if (!cursorInNode) {
          // Find all QuoteMark children (> symbols)
          this.hideQuoteMarks(node.node, decorations, view);
        }
      },
    });
  }

  /**
   * Recursively find and hide quote marks
   */
  private hideQuoteMarks(
    node: SyntaxNode,
    decorations: import("@codemirror/state").Range<Decoration>[],
    view: import("@codemirror/view").EditorView
  ): void {
    let child = node.firstChild;
    while (child) {
      if (child.name === "QuoteMark") {
        // Clamp to line end so replace decoration never spans a newline
        const line = view.state.doc.lineAt(child.from);
        const markEnd = Math.min(child.to + 1, line.to);
        decorations.push(quoteMarkDecorations["quote-mark"].range(child.from, markEnd));
      }
      // Recurse into nested blockquotes
      if (child.name === "Blockquote") {
        this.hideQuoteMarks(child, decorations, view);
      }
      child = child.nextSibling;
    }
  }

  override renderToHTML(node: SyntaxNode, children: string): string | null {
    if (node.name === "QuoteMark") {
      return "";
    }

    if (node.name !== "Blockquote") {
      return null;
    }

    return `<blockquote class="cm-draftly-quote-line"><div class="cm-draftly-quote-content">${children}</div></blockquote>\n`;
  }
}

const theme = createTheme({
  default: {
    // Line styling with left border
    ".cm-draftly-quote-line": {
      borderLeft: "3px solid currentColor",
      paddingLeft: "1em !important",
      paddingTop: "0.25em !important",
      paddingBottom: "0.25em !important",
      marginLeft: "0.25em",
      opacity: "0.85",
    },

    // Quote content styling
    ".cm-draftly-quote-content": {
      fontStyle: "italic",
    },
  },
});
