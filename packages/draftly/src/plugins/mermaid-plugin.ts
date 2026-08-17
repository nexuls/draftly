import { Decoration, type EditorView, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { type DecorationContext, DecorationPlugin } from "../editor/plugin";
import { createTheme, ThemeEnum } from "../editor";
import type { SyntaxNode } from "@lezer/common";
import { tags } from "@lezer/highlight";
import type { MarkdownConfig, BlockParser, Line, BlockContext } from "@lezer/markdown";
import mermaid from "mermaid";

/**
 * Initialize mermaid with default configuration
 */
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  suppressErrorRendering: true,
});

/**
 * Render a mermaid diagram definition to SVG
 */
let mermaidCounter = 0;
async function renderMermaid(
  definition: string,
  options: Record<string, string> = {},
  defaultTheme = "default"
): Promise<{ svg: string; error: string | null }> {
  try {
    const id = `draftly-mermaid-${mermaidCounter++}`;
    let finalDefinition = definition;

    // transform theme to mermaid config
    const mermaidConfig: Record<string, string> = {};
    if (options.theme) {
      mermaidConfig.theme = options.theme;
    } else {
      mermaidConfig.theme = defaultTheme;
    }

    // If we have config to apply, prepend the directive
    if (Object.keys(mermaidConfig).length > 0) {
      const jsonConfig = JSON.stringify(mermaidConfig);
      // Mermaid directive format: %%{init: { ... }}%%
      finalDefinition = `%%{init: ${jsonConfig} }%%\n${definition}`;
    }

    const { svg } = await mermaid.render(id, finalDefinition);
    return { svg, error: null };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    return { svg: "", error: errorMsg };
  }
}

/**
 * Helper to parse attributes from fence line
 * Example: ```mermaid theme="dark" scale="2"
 */
function parseAttributes(fenceLine: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  // Match key="value" or key='value'
  const regex = /(\w+)=["']([^"']*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fenceLine)) !== null && match[1] && match[2]) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

/**
 * Mark decorations for mermaid syntax elements
 */
const mermaidMarkDecorations = {
  "mermaid-block-start": Decoration.line({ class: "cm-draftly-mermaid-block-start" }),
  "mermaid-block-end": Decoration.line({ class: "cm-draftly-mermaid-block-end" }),
  "mermaid-block": Decoration.line({ class: "cm-draftly-mermaid-block" }),
  "mermaid-block-rendered": Decoration.line({ class: "cm-draftly-mermaid-block-rendered" }),
  "mermaid-marker": Decoration.mark({ class: "cm-draftly-mermaid-marker" }),
  "mermaid-hidden": Decoration.mark({ class: "cm-draftly-mermaid-hidden" }),
};

/**
 * Widget to render mermaid block diagrams
 */
class MermaidBlockWidget extends WidgetType {
  constructor(
    readonly definition: string,
    readonly attributes: Record<string, string>,
    readonly defaultTheme: string,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  override eq(other: MermaidBlockWidget): boolean {
    return (
      other.definition === this.definition &&
      JSON.stringify(other.attributes) === JSON.stringify(this.attributes) &&
      other.defaultTheme === this.defaultTheme &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  toDOM(view: EditorView) {
    const div = document.createElement("div");
    div.className = "cm-draftly-mermaid-rendered";
    div.style.cursor = "pointer";

    // Show loading state initially
    div.innerHTML = `<div class="cm-draftly-mermaid-loading">Rendering diagram…</div>`;

    // Render mermaid asynchronously
    // Render mermaid asynchronously
    renderMermaid(this.definition, this.attributes, this.defaultTheme).then(({ svg, error }) => {
      if (error) {
        div.className += " cm-draftly-mermaid-error";
        div.innerHTML = `<span>[Mermaid Error: ${error}]</span>`;
      } else {
        div.innerHTML = svg;
      }
    });

    // Click handler to select the raw mermaid text
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
 * Block parser for mermaid blocks:
 * ```mermaid
 * graph TD
 *   A --> B
 * ```
 */
const mermaidBlockParser: BlockParser = {
  name: "MermaidBlock",
  before: "FencedCode",
  parse(cx: BlockContext, line: Line) {
    const text = line.text;
    const trimmed = text.slice(line.pos).trimStart();

    // Must start with ```mermaid
    if (!trimmed.startsWith("```mermaid")) return false;

    // Ensure nothing meaningful after ```mermaid (allow trailing whitespace)
    // We now allow attributes, so we don't strictly check for empty rest
    // const rest = trimmed.slice(10);
    // if (rest.trim().length > 0) return false;

    const startLine = cx.lineStart;
    let endPos = -1;
    let closeBacktickStart = -1;

    // Move past the opening line and find the closing ```
    while (cx.nextLine()) {
      const currentText = line.text;
      const currentLineStart = cx.lineStart;
      const lastLineEnd = currentLineStart + currentText.length;

      // Check if this line is a closing ``` (only backticks, possibly with whitespace)
      const trimmedLine = currentText.trim();
      if (trimmedLine === "```") {
        endPos = lastLineEnd;
        closeBacktickStart = currentLineStart + currentText.indexOf("```");
        // Move past the closing line so subsequent markdown gets parsed
        cx.nextLine();
        break;
      }
    }

    if (endPos === -1) {
      // No closing found, treat as regular text
      return false;
    }

    // Create the mermaid block element with markers
    const openMarkEnd = startLine + text.indexOf("```mermaid") + 10;
    const openMark = cx.elt("MermaidBlockMark", startLine, openMarkEnd);
    const closeMark = cx.elt("MermaidBlockMark", closeBacktickStart, closeBacktickStart + 3);

    cx.addElement(cx.elt("MermaidBlock", startLine, endPos, [openMark, closeMark]));

    return true;
  },
};

/**
 * MermaidPlugin - Renders mermaid diagrams in the editor
 *
 * Supports block mermaid syntax:
 *   ```mermaid
 *   graph TD
 *     A --> B
 *   ```
 *
 * Behavior:
 * - Always show rendered diagram below the block
 * - Hide raw definition when cursor is outside the block
 * - Show raw definition with styled markers when cursor is inside
 */
export class MermaidPlugin extends DecorationPlugin {
  readonly name = "mermaid";
  readonly version = "1.0.0";
  override decorationPriority = 25;
  override readonly requiredNodes = ["MermaidBlock", "MermaidBlockMark"] as const;

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
   * Return markdown parser extensions for mermaid syntax
   */
  override getMarkdownConfig(): MarkdownConfig {
    return {
      defineNodes: [
        { name: "MermaidBlock", block: true },
        { name: "MermaidBlockMark", style: tags.processingInstruction },
      ],
      parseBlock: [mermaidBlockParser],
    };
  }

  /**
   * Build decorations for mermaid blocks
   */
  buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    const tree = syntaxTree(view.state);
    const config = this.context?.config;
    const currentTheme = config?.theme === ThemeEnum.DARK ? "dark" : "default";

    tree.iterate({
      enter: (node) => {
        const { from, to, name } = node;

        if (name === "MermaidBlock") {
          const content = view.state.sliceDoc(from, to);

          // Extract mermaid definition (remove ```mermaid and ``` markers)
          const lines = content.split("\n");
          const definition = lines
            .slice(1, -1) // Remove first and last lines (the markers)
            .join("\n")
            .trim();

          const docLines = content.split("\n");
          const fenceLine = docLines[0] || "";
          const attributes = parseAttributes(fenceLine);

          const nodeLineStart = view.state.doc.lineAt(from);
          const nodeLineEnd = view.state.doc.lineAt(to);
          const cursorInRange = ctx.selectionOverlapsRange(nodeLineStart.from, nodeLineEnd.to);

          // Calculate line number width for mermaid block
          const totalCodeLines = nodeLineEnd.number - nodeLineStart.number - 1;
          const lineNumWidth = String(totalCodeLines).length;
          let codeLineIndex = 1;

          // Add line decorations for mermaid block
          for (let i = nodeLineStart.number; i <= nodeLineEnd.number; i++) {
            const line = view.state.doc.line(i);
            const isFenceLine = i === nodeLineStart.number || i === nodeLineEnd.number;
            const relativeLineNum = codeLineIndex;

            decorations.push(mermaidMarkDecorations["mermaid-block"].range(line.from));
            if (!cursorInRange) decorations.push(mermaidMarkDecorations["mermaid-block-rendered"].range(line.from));

            if (i === nodeLineStart.number)
              decorations.push(mermaidMarkDecorations["mermaid-block-start"].range(line.from));

            if (i === nodeLineEnd.number)
              decorations.push(mermaidMarkDecorations["mermaid-block-end"].range(line.from));

            if (!isFenceLine) {
              decorations.push(
                Decoration.line({
                  attributes: {
                    "data-line-num": String(relativeLineNum),
                    style: `--line-num-width: ${lineNumWidth}ch`,
                  },
                }).range(line.from)
              );
            }

            // Increment code line index (only for non-fence lines)
            if (!isFenceLine) {
              codeLineIndex++;
            }
          }

          // Always add the rendered widget below the block
          decorations.push(
            Decoration.widget({
              widget: new MermaidBlockWidget(definition, attributes, currentTheme, from, to),
              side: 1,
              block: false,
            }).range(to)
          );

          if (cursorInRange) {
            // Cursor in range: show raw definition with styled markers
            for (let child = node.node.firstChild; child; child = child.nextSibling) {
              if (child.name === "MermaidBlockMark") {
                decorations.push(mermaidMarkDecorations["mermaid-marker"].range(child.from, child.to));
              }
            }
          } else {
            // Cursor out of range: hide the raw text
            decorations.push(mermaidMarkDecorations["mermaid-hidden"].range(from, to));
          }
        }
      },
    });
  }

  /**
   * Render mermaid to HTML for preview mode
   *
   * Renders the actual mermaid diagram to SVG HTML
   */
  override async renderToHTML(
    node: SyntaxNode,
    _children: string,
    ctx: { sliceDoc(from: number, to: number): string; sanitize(html: string): string }
  ): Promise<string | null> {
    if (node.name === "MermaidBlock") {
      const content = ctx.sliceDoc(node.from, node.to);
      const lines = content.split("\n");
      const definition = lines.length > 1 ? lines.slice(1, -1).join("\n").trim() : "";

      const fenceLine = lines[0] || "";
      const attributes = parseAttributes(fenceLine);

      const config = this.context?.config;
      const currentTheme = config?.theme === ThemeEnum.DARK ? "dark" : "default";

      const { svg, error } = await renderMermaid(definition, attributes, currentTheme);

      if (error) {
        return `<div class="cm-draftly-mermaid-error">${ctx.sanitize(`[Mermaid Error: ${error}]`)}</div>`;
      }

      return `<div class="cm-draftly-mermaid-rendered">${svg}</div>`;
    }

    // Hide mermaid markers in preview
    if (node.name === "MermaidBlockMark") {
      return "";
    }

    return null;
  }
}

/**
 * Theme for mermaid styling
 */
const theme = createTheme({
  default: {
    // Raw mermaid block lines (monospace)
    ".cm-draftly-mermaid-block:not(.cm-draftly-mermaid-block-rendered)": {
      "--radius": "0.375rem",
      position: "relative",

      fontFamily: "var(--font-jetbrains-mono, monospace)",
      fontSize: "0.9rem",
      backgroundColor: "rgba(0, 0, 0, 0.03)",
      padding: "0 1rem !important",
      paddingLeft: "calc(var(--line-num-width, 2ch) + 1rem) !important",
      lineHeight: "1.5",
      borderLeft: "1px solid var(--color-border)",
      borderRight: "1px solid var(--color-border)",
    },

    ".cm-draftly-mermaid-block-start:not(.cm-draftly-mermaid-block-rendered)": {
      overflow: "hidden",
      borderTopLeftRadius: "var(--radius)",
      borderTopRightRadius: "var(--radius)",
      borderTop: "1px solid var(--color-border)",
    },

    ".cm-draftly-mermaid-block-end:not(.cm-draftly-mermaid-block-rendered)": {
      overflow: "hidden",
      borderBottomLeftRadius: "var(--radius)",
      borderBottomRightRadius: "var(--radius)",
      borderBottom: "1px solid var(--color-border)",
    },

    ".cm-draftly-mermaid-block:not(.cm-draftly-mermaid-block-rendered)::before": {
      content: "attr(data-line-num)",
      position: "absolute",
      left: "0.5rem",
      top: "0.2rem",
      width: "var(--line-num-width, 2ch)",
      textAlign: "right",
      color: "#6a737d",
      opacity: "0.6",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
      fontSize: "0.85rem",
      userSelect: "none",
    },

    ".cm-draftly-mermaid-block.cm-draftly-mermaid-block-rendered br": {
      display: "none",
    },

    // Mermaid markers (```mermaid / ```)
    ".cm-draftly-mermaid-marker": {
      color: "#6a737d",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
    },

    // Hidden mermaid syntax (when cursor is not in range)
    ".cm-draftly-mermaid-hidden": {
      display: "none",
    },

    // Rendered mermaid container
    ".cm-draftly-mermaid-rendered": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "1em 0",
      borderRadius: "4px",
      overflow: "auto",
    },

    // SVG inside rendered container
    ".cm-draftly-mermaid-rendered svg": {
      maxWidth: "100%",
      height: "auto",
      aspectRatio: "auto",
    },

    // Loading state
    ".cm-draftly-mermaid-loading": {
      display: "inline-block",
      padding: "0.5em 1em",
      color: "#6a737d",
      fontSize: "0.875em",
      fontStyle: "italic",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
    },

    // Error styling
    ".cm-draftly-mermaid-error": {
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
    ".cm-draftly-mermaid-block:not(.cm-draftly-mermaid-block-rendered)": {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
    },

    ".cm-draftly-mermaid-marker": {
      color: "#8b949e",
    },

    ".cm-draftly-mermaid-loading": {
      color: "#8b949e",
    },

    ".cm-draftly-mermaid-error": {
      backgroundColor: "rgba(255, 0, 0, 0.15)",
      color: "#f85149",
    },
  },
});
