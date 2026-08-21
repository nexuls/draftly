import { Decoration, type EditorView, WidgetType } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { type DecorationContext, DecorationPlugin } from "../editor/plugin";
import { createTheme } from "../editor";
import { resolveWidgetRange } from "../lib/widget-position";
import { parseMixed, type Parser, type SyntaxNode } from "@lezer/common";
import { tags } from "@lezer/highlight";
import type { MarkdownConfig, InlineParser, BlockParser, Line, BlockContext } from "@lezer/markdown";
import katex from "katex";
import { createWrapSelectionInputHandler } from "../lib";

/**
 * Options for {@link MathPlugin}.
 */
export interface MathPluginOptions {
  /**
   * A LaTeX parser to overlay on math content, for syntax highlighting of the raw
   * source while the cursor is inside a formula.
   *
   * Injected rather than bundled. The obvious candidate, `codemirror-lang-latex`,
   * is AGPL-3.0-or-later, and draftly is MIT — depending on it would push its
   * terms onto every consumer. Passing the parser in leaves that decision where
   * it belongs.
   *
   * @example
   * ```ts
   * import { latexLanguage } from "codemirror-lang-latex";
   * import { styleTags } from "@lezer/highlight";
   * import { MathPlugin, latexHighlightTags } from "draftly/plugins";
   *
   * new MathPlugin({
   *   mathParser: latexLanguage.parser.configure({
   *     props: [styleTags(latexHighlightTags)],
   *   }),
   * });
   * ```
   */
  mathParser?: Parser;

  /**
   * Inject KaTeX's stylesheet — fonts included — into the document head.
   *
   * Defaults to `false`, which means Draftly ships no math CSS at all and the consumer
   * imports `katex/dist/katex.min.css` themselves. That is the cheap path: the stylesheet
   * plus its 20 inlined font faces is ~360 KB, and a build that already handles CSS and
   * font assets does it better.
   *
   * Set it to `true` when there is no such build step — a `<script>` tag, a CDN, an
   * embedded editor — and Draftly will inject the whole thing once per document. The
   * fonts are `data:` URIs rather than relative `fonts/KaTeX_*` paths, which is what makes
   * a `<style>` element viable at all: KaTeX's own rules resolve against the *page* URL
   * and 404 for every consumer who does not happen to serve the fonts from there.
   *
   * The stylesheet lives behind a dynamic `import()` and tsup emits it as its own chunk on
   * both formats, so leaving this at `false` costs nothing.
   *
   * @defaultValue false
   */
  injectStyles?: boolean;
}

/**
 * Style tags for LaTeX node types that `codemirror-lang-latex` leaves untagged.
 *
 * Its parser specializes many control sequences (`\text`, `\hbox`, `\href`,
 * sectioning, list, table and colour macros) into named node types that its own
 * `styleTags` does not cover, so they highlight as plain text next to the generic
 * `CtrlSeq` token. This is the missing half; pass it to `styleTags()` when
 * configuring a parser for {@link MathPluginOptions.mathParser}.
 *
 * Node type names only — no code from that package is reproduced here.
 */
export const latexHighlightTags: Record<string, typeof tags.keyword> = {
  [[
    "MathTextCtrlSeq HboxCtrlSeq DefCtrlSeq LetCtrlSeq LeftCtrlSeq RightCtrlSeq",
    "ItemCtrlSeq CenteringCtrlSeq MaketitleCtrlSeq HrefCtrlSeq UrlCtrlSeq",
    "VerbCtrlSeq LstInlineCtrlSeq IncludeGraphicsCtrlSeq IncludeSvgCtrlSeq",
    "CaptionCtrlSeq InputCtrlSeq IncludeCtrlSeq SubfileCtrlSeq",
    "NewCommandCtrlSeq RenewCommandCtrlSeq NewEnvironmentCtrlSeq",
    "RenewEnvironmentCtrlSeq NewTheoremCtrlSeq TheoremStyleCtrlSeq",
    "HLineCtrlSeq TopRuleCtrlSeq MidRuleCtrlSeq BottomRuleCtrlSeq",
    "MultiColumnCtrlSeq ParBoxCtrlSeq TextColorCtrlSeq ColorBoxCtrlSeq",
    "TextMediumCtrlSeq TextSansSerifCtrlSeq TextSuperscriptCtrlSeq",
    "TextSubscriptCtrlSeq TextStrikeOutCtrlSeq SetLengthCtrlSeq",
    "FootnoteCtrlSeq EndnoteCtrlSeq AffilCtrlSeq AffiliationCtrlSeq",
  ].join(" ")]: tags.keyword,
  "OpenParenCtrlSym CloseParenCtrlSym OpenBracketCtrlSym CloseBracketCtrlSym LineBreakCtrlSym": tags.operator,
};

/**
 * Inject KaTeX's stylesheet into the document head, at most once per document.
 *
 * Called from the `MathPlugin` constructor when {@link MathPluginOptions.injectStyles} is
 * set, rather than at module scope. Module-scope DOM mutation runs on `import`, which
 * makes the module unconditionally side-effecting — a bundler must then keep it even for a
 * consumer who never writes a formula — and it touches `document` during SSR module
 * evaluation, where there is none.
 *
 * The stylesheet is `import()`ed rather than imported so that the ~360 KB of inlined fonts
 * lands in its own chunk and never loads on the default path. That makes injection
 * asynchronous: a formula rendered in the same tick paints in a fallback face for a moment.
 * Injecting from the constructor rather than from `renderMath` keeps that window as short
 * as it can be.
 *
 * The guard is the element lookup plus an in-flight flag, so this stays correct across
 * multiple editors, concurrent construction, and hot reloads.
 *
 * @returns Nothing; failures are reported to the console rather than thrown, because there
 * is no caller left to catch them by the time the import settles
 */
function injectKatexStyles(): void {
  if (typeof document === "undefined") return;
  if (katexStylesRequested) return;
  if (document.getElementById(KATEX_STYLE_ID)) return;
  katexStylesRequested = true;

  import("./katex-styles.generated")
    .then(({ katexStyles }) => {
      if (document.getElementById(KATEX_STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = KATEX_STYLE_ID;
      style.textContent = katexStyles;
      document.head.appendChild(style);
    })
    .catch((e: unknown) => {
      katexStylesRequested = false;
      console.error("[draftly] Failed to load KaTeX styles:", e);
    });
}

/** Identifies the injected `<style>` element, so a second editor does not add another. */
const KATEX_STYLE_ID = "draftly-katex-styles";

/**
 * Whether a stylesheet load is in flight or has completed.
 *
 * Deliberately module-scoped: the target is `document.head`, which is shared by every
 * editor on the page, so "has this been injected yet" is a per-document question rather
 * than a per-plugin one. Reset on failure so a transient network error can be retried by
 * the next editor.
 */
let katexStylesRequested = false;

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
 * Render LaTeX to HTML using KaTeX.
 *
 * KaTeX's default output is `htmlAndMathml`: the visual layer is marked `aria-hidden` and
 * a MathML representation sits beside it, so the formula is already readable by assistive
 * technology. **Do not add an `aria-label` to the container** — it would override the
 * MathML with a flat string and make accessibility worse, not better.
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

  /**
   * Compares **content only**.
   *
   * `eq()` answers "can CodeMirror keep the DOM it already built?". Document positions
   * shift on any edit earlier in the document, so including them made the answer
   * permanently no -- every formula below an edit was torn down and re-rendered
   * through KaTeX on every keystroke. The handlers resolve the range from the live DOM instead.
   */
  override eq(other: InlineMathWidget): boolean {
    return other.latex === this.latex;
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-draftly-math-rendered cm-draftly-math-rendered-inline";
    span.style.cursor = "pointer";

    const { html, error } = renderMath(this.latex, false);

    if (error) {
      span.classList.add("cm-draftly-math-error");
      span.setAttribute("role", "alert");
      span.textContent = `[Math Error: ${error}]`;
    } else {
      span.innerHTML = html;
    }

    // Click handler to select the raw math text
    span.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const range = resolveWidgetRange(view, span, ["InlineMath"]) ?? { from: this.from, to: this.to };
      view.dispatch({
        selection: { anchor: range.from, head: range.to },
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

  /**
   * Compares **content only**.
   *
   * `eq()` answers "can CodeMirror keep the DOM it already built?". Document positions
   * shift on any edit earlier in the document, so including them made the answer
   * permanently no -- every block formula below an edit re-rendered through
   * KaTeX on every keystroke. The handlers resolve the range from the live DOM instead.
   */
  override eq(other: MathBlockWidget): boolean {
    return other.latex === this.latex;
  }

  toDOM(view: EditorView) {
    const div = document.createElement("div");
    div.className = "cm-draftly-math-rendered cm-draftly-math-rendered-block";
    div.style.cursor = "pointer";

    const { html, error } = renderMath(this.latex, true);

    if (error) {
      div.classList.add("cm-draftly-math-error");
      div.setAttribute("role", "alert");
      div.textContent = `[Math Error: ${error}]`;
    } else {
      div.innerHTML = html;
    }

    // Click handler to select the raw math text
    div.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const range = resolveWidgetRange(view, div, ["MathBlock"]) ?? { from: this.from, to: this.to };
      view.dispatch({
        selection: { anchor: range.from, head: range.to },
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
 * Block parser for math blocks: `$$...$$`
 *
 * Accepts both the fenced form, where the delimiters sit on their own lines, and
 * the single-line form `$$x^2$$`. The single-line form is only claimed when it
 * occupies the whole line; with trailing content the line is left to the
 * paragraph and inline-math parsers rather than silently swallowing the rest.
 */
const mathBlockParser: BlockParser = {
  name: "MathBlock",
  parse(cx: BlockContext, line: Line) {
    const text = line.text;

    // `line.pos` is already past any container prefix (list bullet, blockquote
    // marker). Offsets are measured against the raw line so that they stay
    // valid document positions.
    const openIndex = text.indexOf("$$", line.pos);
    if (openIndex === -1) return false;
    if (text.slice(line.pos, openIndex).trim() !== "") return false;

    const startLine = cx.lineStart;
    const openMarkStart = startLine + openIndex;
    let endPos = -1;

    const sameLineClose = text.indexOf("$$", openIndex + 2);
    if (sameLineClose !== -1) {
      // Single-line form. Anything after the closing fence means this is not a
      // block; bail so the rest of the line still gets parsed.
      if (text.slice(sameLineClose + 2).trim() !== "") return false;
      endPos = startLine + sameLineClose + 2;
      cx.nextLine();
    } else {
      while (cx.nextLine()) {
        const currentText = line.text;
        const closeIndex = currentText.lastIndexOf("$$");

        // The closing fence must end the line, but trailing whitespace is fine —
        // and the fence position, not the line end, is what bounds the mark.
        if (closeIndex !== -1 && currentText.slice(closeIndex + 2).trim() === "") {
          endPos = cx.lineStart + closeIndex + 2;
          // Move past the closing line so subsequent markdown gets parsed.
          cx.nextLine();
          break;
        }
      }
    }

    // No closing fence: treat as a regular paragraph.
    if (endPos === -1) return false;

    const openMark = cx.elt("MathBlockMark", openMarkStart, openMarkStart + 2);
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

  /** A LaTeX parser overlaid on math content, when the host supplied one. */
  private readonly mathParser: Parser | undefined;

  /**
   * @param options - LaTeX parser for highlighting raw math source, and whether to inject
   * KaTeX's stylesheet; see {@link MathPluginOptions}
   */
  constructor(options: MathPluginOptions = {}) {
    super();
    this.mathParser = options.mathParser;
    if (options.injectStyles) injectKatexStyles();
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
      ...(this.mathParser ? { wrap: this.buildMathOverlay(this.mathParser) } : {}),
    };
  }

  /**
   * Overlay a LaTeX parser onto math node contents.
   *
   * The overlay spans the `$`/`$$` markers rather than stopping short of them, so
   * the LaTeX parser enters math mode and tokenises operators and identifiers as
   * math rather than as prose.
   *
   * @param parser - The LaTeX parser to overlay
   * @returns A mixed-parser wrapper for the markdown parser
   */
  private buildMathOverlay(parser: Parser) {
    return parseMixed((node) => {
      if (node.name !== "InlineMath" && node.name !== "MathBlock") return null;
      return { parser, overlay: [{ from: node.from, to: node.to }] };
    });
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
      fontFamily: "var(--draftly-font-mono)",
    },

    ".cm-draftly-math-block br": {
      display: "none",
    },

    // Math markers ($ $$)
    ".cm-draftly-math-marker": {
      color: "var(--draftly-color-muted)",
      fontFamily: "var(--draftly-font-mono)",
    },

    // Inline math styling when editing
    ".cm-draftly-math-inline": {
      fontFamily: "var(--draftly-font-mono)",
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
      backgroundColor: "var(--draftly-tint-1)",
      borderRadius: "4px",
      overflow: "auto",
    },

    // Math error styling
    ".cm-draftly-math-error": {
      display: "inline-block",
      padding: "0.25em 0.5em",
      backgroundColor: "var(--draftly-color-error-surface)",
      color: "var(--draftly-color-danger)",
      borderRadius: "4px",
      fontSize: "0.875em",
      fontStyle: "italic",
      fontFamily: "var(--draftly-font-mono)",
    },
  },
});
