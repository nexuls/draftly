import { Decoration, type EditorView, WidgetType } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { type DecorationContext, DecorationPlugin } from "../editor/plugin";
import { createTheme } from "../editor";
import type { SyntaxNode } from "@lezer/common";
import { tags } from "@lezer/highlight";
import type { MarkdownConfig, InlineParser, BlockParser, Line, BlockContext } from "@lezer/markdown";
import katex from "katex";
import { createWrapSelectionInputHandler } from "../lib";
// @ts-expect-error - raw import for CSS as string
import katexCss from "katex/dist/katex.min.css?raw";

/**
 * Inject KaTeX CSS into the document head (only once)
 */
function injectKatexStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("draftly-katex-styles")) return;

  const style = document.createElement("style");
  style.id = "draftly-katex-styles";
  style.textContent = katexCss;
  document.head.appendChild(style);
}

// Inject styles when module loads
injectKatexStyles();

// Character codes
const DOLLAR = 36; // '$'

/**
 * Mark decorations for math syntax elements
 */
const mathMarkDecorations = {
  "math-block": Decoration.line({ class: "cm-draftly-math-block" }),
  "math-inline": Decoration.mark({ class: "cm-draftly-math-inline" }),
  "math-marker": Decoration.mark({ class: "cm-draftly-math-marker" }),
  "math-hidden": Decoration.mark({ class: "cm-draftly-math-hidden" }),
};

/**
 * Render LaTeX to HTML using KaTeX
 */
function renderMath(latex: string, displayMode: boolean): { html: string; error: string | null } {
  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      errorColor: "#d73a49",
      trust: false,
      strict: false,
    });
    return { html, error: null };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    return { html: "", error: errorMsg };
  }
}

/**
 * Widget to render inline math
 */
class InlineMathWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  override eq(other: InlineMathWidget): boolean {
    return other.latex === this.latex && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-draftly-math-rendered cm-draftly-math-rendered-inline";
    span.style.cursor = "pointer";

    const { html, error } = renderMath(this.latex, false);

    if (error) {
      span.className += " cm-draftly-math-error";
      span.textContent = `[Math Error: ${error}]`;
    } else {
      span.innerHTML = html;
    }

    // Click handler to select the raw math text
    span.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from, head: this.to },
        scrollIntoView: true,
      });
      view.focus();
    });

    return span;
  }

  override ignoreEvent(event: Event) {
    return event.type !== "click";
  }
}

/**
 * Widget to render block math (display mode)
 */
class MathBlockWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  override eq(other: MathBlockWidget): boolean {
    return other.latex === this.latex && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView) {
    const div = document.createElement("div");
    div.className = "cm-draftly-math-rendered cm-draftly-math-rendered-block";
    div.style.cursor = "pointer";

    const { html, error } = renderMath(this.latex, true);

    if (error) {
      div.className += " cm-draftly-math-error";
      div.textContent = `[Math Error: ${error}]`;
    } else {
      div.innerHTML = html;
    }

    // Click handler to select the raw math text
    div.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from, head: this.to },
        scrollIntoView: true,
      });
      view.focus();
    });

    return div;
  }

  override ignoreEvent(event: Event) {
    return event.type !== "click";
  }
}

/**
 * Inline parser for inline math: $...$
 * Does not match $$ (block math markers)
 */
const inlineMathParser: InlineParser = {
  name: "InlineMath",
  parse(cx, next, pos) {
    // Check if we are at a $ character
    if (next !== DOLLAR) return -1;

    // Don't match $$ (that's block math)
    if (cx.char(pos + 1) === DOLLAR) return -1;

    // Find the closing $
    let end = pos + 1;
    while (end < cx.end) {
      const char = cx.char(end);
      if (char === DOLLAR) {
        // Found closing $, but make sure it's not $$
        if (cx.char(end + 1) !== DOLLAR) {
          // Extract the math content (excluding the $ markers)
          const content = cx.slice(pos + 1, end);

          // Skip empty math
          if (content.trim().length === 0) return -1;

          // Create the element with markers
          const openMark = cx.elt("InlineMathMark", pos, pos + 1);
          const closeMark = cx.elt("InlineMathMark", end, end + 1);
          const inlineMath = cx.elt("InlineMath", pos, end + 1, [openMark, closeMark]);

          return cx.addElement(inlineMath);
        }
        // Skip $$ for block math
        return -1;
      }
      // Skip escaped characters
      if (char === 92 /* backslash */) {
        end += 2;
        continue;
      }
      end++;
    }

    return -1;
  },
};

/**
 * Block parser for math blocks: $$...$$
 */
const mathBlockParser: BlockParser = {
  name: "MathBlock",
  parse(cx: BlockContext, line: Line) {
    // Check if line starts with $$
    const text = line.text;
    const trimmed = text.slice(line.pos).trimStart();

    if (!trimmed.startsWith("$$")) return false;

    // Find the end of the math block
    const startLine = cx.lineStart;
    let endPos = -1;
    let lastLineEnd = startLine + line.text.length;

    // Move past the opening line
    while (cx.nextLine()) {
      const currentText = line.text;
      lastLineEnd = cx.lineStart + currentText.length;

      // Check if this line contains closing $$
      if (currentText.trimEnd().endsWith("$$")) {
        endPos = lastLineEnd;
        // Move past the closing line so subsequent markdown gets parsed
        cx.nextLine();
        break;
      }
    }

    if (endPos === -1) {
      // No closing found, treat as regular paragraph
      return false;
    }

    // Create the math block element
    const openMark = cx.elt("MathBlockMark", startLine, startLine + text.indexOf("$$") + 2);
    const closeMark = cx.elt("MathBlockMark", endPos - 2, endPos);
    cx.addElement(cx.elt("MathBlock", startLine, endPos, [openMark, closeMark]));

    return true;
  },
};

/**
 * MathPlugin - Renders LaTeX math expressions using KaTeX
 *
 * Supports:
 * - Inline math: $E = mc^2$
 * - Block math (display mode):
 *   $$
 *   \int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
 *   $$
 *
 * Behavior:
 * - Inline math: Show rendered output when cursor outside, raw LaTeX when inside
 * - Block math: Always show rendered output below, hide raw when cursor outside (like ImagePlugin)
 */
export class MathPlugin extends DecorationPlugin {
  readonly name = "math";
  readonly version = "1.0.0";
  override decorationPriority = 25;
  override readonly requiredNodes = ["InlineMath", "MathBlock", "InlineMathMark", "MathBlockMark"] as const;

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
   * Intercepts dollar typing to wrap selected text as inline math.
   *
   * If user types '$' while text is selected, wraps each selected range
   * with single dollars (selected -> $selected$).
   */
  override getExtensions(): Extension[] {
    return [createWrapSelectionInputHandler({ $: "$" })];
  }

  /**
   * Return markdown parser extensions for math syntax
   */
  override getMarkdownConfig(): MarkdownConfig {
    return {
      defineNodes: [
        { name: "InlineMath", style: tags.emphasis },
        { name: "InlineMathMark", style: tags.processingInstruction },
        { name: "MathBlock", block: true },
        { name: "MathBlockMark", style: tags.processingInstruction },
      ],
      parseInline: [inlineMathParser],
      parseBlock: [mathBlockParser],
    };
  }

  /**
   * Build decorations for math expressions
   */
  buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    // Scoped to the viewport: an unbounded walk makes every update -- including a
    // plain cursor move -- cost O(document). See DecorationContext.iterateVisible.
    ctx.iterateVisible({
      enter: (node) => {
        const { from, to, name } = node;

        // Handle inline math
        if (name === "InlineMath") {
          const content = view.state.sliceDoc(from, to);
          // Extract LaTeX content (remove $ markers)
          const latex = content.slice(1, -1);

          const cursorInRange = ctx.selectionOverlapsRange(from, to);

          if (cursorInRange) {
            // Show raw math with styled markers
            decorations.push(mathMarkDecorations["math-inline"].range(from, to));

            // Style the $ markers
            for (let child = node.node.firstChild; child; child = child.nextSibling) {
              if (child.name === "InlineMathMark") {
                decorations.push(mathMarkDecorations["math-marker"].range(child.from, child.to));
              }
            }
          } else {
            // Replace with rendered math widget
            decorations.push(
              Decoration.replace({
                widget: new InlineMathWidget(latex, from, to),
              }).range(from, to)
            );
          }
        }

        // Handle math blocks
        if (name === "MathBlock") {
          const content = view.state.sliceDoc(from, to);

          // Extract LaTeX content (remove $$ markers and trim)
          const lines = content.split("\n");
          const latex = lines
            .slice(1, -1) // Remove first and last lines (the $$ markers)
            .join("\n")
            .trim();

          // If the block is simple (everything on one line), handle differently
          const singleLine = !content.includes("\n");
          const latexContent = singleLine ? content.slice(2, -2).trim() : latex;

          const nodeLineStart = view.state.doc.lineAt(from);
          const nodeLineEnd = view.state.doc.lineAt(to);
          const cursorInRange = ctx.selectionOverlapsRange(nodeLineStart.from, nodeLineEnd.to);

          // Add line decoration for math block
          decorations.push(mathMarkDecorations["math-block"].range(from));

          // Always add the math block widget below the node (like image plugin)
          decorations.push(
            Decoration.widget({
              widget: new MathBlockWidget(latexContent, from, to),
              side: 1,
              block: false,
            }).range(to)
          );

          for (let i = nodeLineStart.number; i <= nodeLineEnd.number; i++) {
            const line = view.state.doc.line(i);
            decorations.push(mathMarkDecorations["math-block"].range(line.from));
          }

          // Cursor in range: show raw LaTeX with styling
          if (cursorInRange) {
            // Style the $$ markers
            for (let child = node.node.firstChild; child; child = child.nextSibling) {
              if (child.name === "MathBlockMark") {
                decorations.push(mathMarkDecorations["math-marker"].range(child.from, child.to));
              }
            }
          } else {
            // Cursor out of range: hide the raw math text
            decorations.push(mathMarkDecorations["math-hidden"].range(from, to));
          }
        }
      },
    });
  }

  /**
   * Render math to HTML for preview mode
   */
  override renderToHTML(
    node: SyntaxNode,
    _children: string,
    ctx: { sliceDoc(from: number, to: number): string; sanitize(html: string): string }
  ): string | null {
    if (node.name === "InlineMath") {
      const content = ctx.sliceDoc(node.from, node.to);
      const latex = content.slice(1, -1);
      const { html, error } = renderMath(latex, false);

      if (error) {
        return `<span class="cm-draftly-math-error">[Math Error: ${ctx.sanitize(error)}]</span>`;
      }
      return `<span class="cm-draftly-math-rendered cm-draftly-math-rendered-inline">${html}</span>`;
    }

    if (node.name === "MathBlock") {
      const content = ctx.sliceDoc(node.from, node.to);
      const lines = content.split("\n");
      const latex = lines.length > 1 ? lines.slice(1, -1).join("\n").trim() : content.slice(2, -2).trim();
      const { html, error } = renderMath(latex, true);

      if (error) {
        return `<div class="cm-draftly-math-error">[Math Error: ${ctx.sanitize(error)}]</div>`;
      }
      return `<div class="cm-draftly-math-rendered cm-draftly-math-rendered-block">${html}</div>`;
    }

    // Hide math markers in preview
    if (node.name === "InlineMathMark" || node.name === "MathBlockMark") {
      return "";
    }

    return null;
  }
}

/**
 * Theme for math styling
 */
const theme = createTheme({
  default: {
    ".cm-draftly-math-block": {
      fontFamily: "var(--font-jetbrains-mono, monospace)",
    },

    ".cm-draftly-math-block br": {
      display: "none",
    },

    // Math markers ($ $$)
    ".cm-draftly-math-marker": {
      color: "#6a737d",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
    },

    // Inline math styling when editing
    ".cm-draftly-math-inline": {
      fontFamily: "var(--font-jetbrains-mono, monospace)",
      fontSize: "0.9em",
    },

    // Hidden math syntax (when cursor is not in range)
    ".cm-draftly-math-hidden": {
      display: "none",
    },

    // Hidden line (for multi-line blocks)
    ".cm-draftly-hidden-line": {
      display: "none",
    },

    // Rendered math container (both inline and block)
    ".cm-draftly-math-rendered": {
      fontFamily: "KaTeX_Main, 'Times New Roman', serif",
    },

    // Inline rendered math
    ".cm-draftly-math-rendered-inline": {
      display: "inline",
      verticalAlign: "baseline",
    },

    // Block rendered math (display mode)
    ".cm-draftly-math-rendered-block": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "1em 0",
      backgroundColor: "rgba(0, 0, 0, 0.02)",
      borderRadius: "4px",
      overflow: "auto",
    },

    // Math error styling
    ".cm-draftly-math-error": {
      display: "inline-block",
      padding: "0.25em 0.5em",
      backgroundColor: "rgba(255, 0, 0, 0.1)",
      color: "#d73a49",
      borderRadius: "4px",
      fontSize: "0.875em",
      fontStyle: "italic",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
    },
  },

  dark: {
    ".cm-draftly-math-marker": {
      color: "#8b949e",
    },

    ".cm-draftly-math-rendered-block": {
      backgroundColor: "rgba(255, 255, 255, 0.02)",
    },

    ".cm-draftly-math-error": {
      backgroundColor: "rgba(255, 0, 0, 0.15)",
      color: "#f85149",
    },
  },
});
