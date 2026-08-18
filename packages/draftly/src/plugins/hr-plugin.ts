import { Decoration } from "@codemirror/view";
import { type DecorationContext, DecorationPlugin } from "../editor/plugin";
import { createTheme } from "../editor";
import type { SyntaxNode } from "@lezer/common";

/**
 * Line decoration for horizontal rule lines
 */
const hrLineDecoration = Decoration.line({ class: "cm-draftly-hr-line" });

/**
 * Mark decoration to hide raw markers (---, ***, ___) when unfocused
 */
const hrMarkDecoration = Decoration.replace({});

/**
 * HRPlugin - Decorates markdown horizontal rules
 *
 * Adds visual styling to thematic breaks (---, ***, ___)
 * - Line decoration that renders a centered horizontal line
 * - Hides raw marker characters when the cursor is not on the line
 */
export class HRPlugin extends DecorationPlugin {
  readonly name = "hr";
  readonly version = "1.0.0";
  override decorationPriority = 10;
  override readonly requiredNodes = ["HorizontalRule"] as const;

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
   * Build horizontal rule decorations by iterating the syntax tree
   */
  buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    // Scoped to the viewport: an unbounded walk makes every update -- including a
    // plain cursor move -- cost O(document). See DecorationContext.iterateVisible.
    ctx.iterateVisible({
      enter: (node) => {
        const { from, to, name } = node;

        if (name !== "HorizontalRule") {
          return;
        }

        // Add line decoration for the horizontal rule styling
        const line = view.state.doc.lineAt(from);
        decorations.push(hrLineDecoration.range(line.from));

        // Hide the raw markers when cursor is not on the line
        const cursorInNode = ctx.selectionOverlapsRange(from, to);
        if (!cursorInNode) {
          // Clamp to line end so replace decoration never spans a newline
          const markEnd = Math.min(to, line.to);
          decorations.push(hrMarkDecoration.range(from, markEnd));
        }
      },
    });
  }

  override renderToHTML(node: SyntaxNode, _children: string): string | null {
    if (node.name !== "HorizontalRule") {
      return null;
    }

    return `<hr class="cm-draftly-hr-line" />\n`;
  }
}

const theme = createTheme({
  default: {
    // Line styling — displays a centered horizontal line
    ".cm-draftly-hr-line": {
      display: "flex",
      alignItems: "center",
      paddingTop: "0.75em",
      paddingBottom: "0.75em",
      border: "none",
      "&::after": {
        content: '""',
        flex: "1",
        height: "2px",
        background: "currentColor",
        opacity: "0.3",
      },
    },
  },
});
