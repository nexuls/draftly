import { Decoration, type EditorView, type KeyBinding, WidgetType } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { LanguageDescription } from "@codemirror/language";
import { type DecorationContext, DecorationPlugin, type DescribedKeyBinding } from "../editor/plugin";
import { toggleMarkdownStyle } from "../editor";
import type { Parser, SyntaxNode } from "@lezer/common";
import { type Highlighter, highlightCode } from "@lezer/highlight";
import { languages } from "@codemirror/language-data";
import { createWrapSelectionInputHandler } from "../lib";
import { codePluginTheme as theme } from "./code-plugin.theme";

// ============================================================================
// Constants
// ============================================================================

/** Copy icon SVG (clipboard) */
const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

/** Checkmark icon SVG (success state) */
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

/** Delay before resetting copy button state (ms) */
const COPY_RESET_DELAY = 2000;

/** Shown on the copy button when the clipboard write is rejected. */
const CROSS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

/** Code fence marker in markdown blocks */
const CODE_FENCE = "```";

/** Regex for quoted code info values like title="file.ts" */
const QUOTED_INFO_PATTERN = /(\w+)="([^"]*)"/g;

/** Regex for /pattern/ with optional instance selectors (/pattern/1-3,5) */
const TEXT_HIGHLIGHT_PATTERN = /\/([^/]+)\/(?:(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*))?/g;

interface PreviewRenderContext {
  sliceDoc(from: number, to: number): string;
  sanitize(html: string): string;
  syntaxHighlighters?: readonly Highlighter[];
}

// ============================================================================
// Decorations
// ============================================================================

/** Mark and line decorations for code elements */
const codeMarkDecorations = {
  // Inline code
  "inline-code": Decoration.mark({ class: "cm-draftly-code-inline" }),
  "inline-mark": Decoration.replace({}),

  // Fenced code block
  "code-block-line": Decoration.line({ class: "cm-draftly-code-block-line" }),
  "code-block-line-start": Decoration.line({ class: "cm-draftly-code-block-line-start" }),
  "code-block-line-end": Decoration.line({ class: "cm-draftly-code-block-line-end" }),
  "code-fence": Decoration.mark({ class: "cm-draftly-code-fence" }),
  "code-hidden": Decoration.replace({}),

  // Highlights
  "code-line-highlight": Decoration.line({ class: "cm-draftly-code-line-highlight" }),
  "code-text-highlight": Decoration.mark({ class: "cm-draftly-code-text-highlight" }),

  // Diff preview
  "diff-line-add": Decoration.line({ class: "cm-draftly-code-line-diff-add" }),
  "diff-line-del": Decoration.line({ class: "cm-draftly-code-line-diff-del" }),
  "diff-sign-add": Decoration.mark({ class: "cm-draftly-code-diff-sign-add" }),
  "diff-sign-del": Decoration.mark({ class: "cm-draftly-code-diff-sign-del" }),
  "diff-mod-add": Decoration.mark({ class: "cm-draftly-code-diff-mod-add" }),
  "diff-mod-del": Decoration.mark({ class: "cm-draftly-code-diff-mod-del" }),
  "diff-escape-hidden": Decoration.replace({}),
};

/**
 * Text highlight definition
 * Matches text or regex patterns with optional instance selection
 */
export interface TextHighlight {
  /** The pattern to match (regex without slashes) */
  pattern: string;
  /** Specific instances to highlight (e.g., [3,5] or range [3,4,5]) */
  instances?: number[];
}

/**
 * Properties extracted from CodeInfo string
 *
 * Example: ```tsx line-numbers{5} title="hello.tsx" caption="Example" copy {2-4,5} /Hello/3-5
 */
export interface CodeBlockProperties {
  /** Language identifier (first token) */
  language: string;
  /** Show line numbers, optionally starting from a specific number */
  showLineNumbers?: number | boolean;
  /** Title to display */
  title?: string;
  /** Caption to display */
  caption?: string;
  /** Show copy button */
  copy?: boolean;
  /** Enable diff preview mode */
  diff?: boolean;
  /** Lines to highlight (e.g., [2,3,4,5,9]) */
  highlightLines?: number[];
  /** Text patterns to highlight with optional instance selection */
  highlightText?: TextHighlight[];
}

type DiffLineKind = "normal" | "addition" | "deletion";

interface DiffLineState {
  kind: DiffLineKind;
  content: string;
  contentOffset: number;
  escapedMarker: boolean;
  modificationRanges?: Array<[number, number]>;
}

interface DiffDisplayLineNumbers {
  oldLine: number | null;
  newLine: number | null;
}

// ============================================================================
// Widgets
// ============================================================================

/**
 * Widget for code block header.
 * Displays title or language on the left, and a copy button on the right.
 */
class CodeBlockHeaderWidget extends WidgetType {
  constructor(
    private props: CodeBlockProperties,
    private codeContent: string
  ) {
    super();
  }

  /** Creates the header DOM element with title/language and optional copy button. */
  toDOM(): HTMLElement {
    const header = document.createElement("div");
    header.className = "cm-draftly-code-header";

    // Left side: title or language
    const leftSide = document.createElement("div");
    leftSide.className = "cm-draftly-code-header-left";

    if (this.props.title) {
      const title = document.createElement("span");
      title.className = "cm-draftly-code-header-title";
      title.textContent = this.props.title;
      leftSide.appendChild(title);
    } else if (this.props.language) {
      const lang = document.createElement("span");
      lang.className = "cm-draftly-code-header-lang";
      lang.textContent = this.props.language;
      leftSide.appendChild(lang);
    }

    header.appendChild(leftSide);

    // Right side: copy button
    if (this.props.copy !== false) {
      const rightSide = document.createElement("div");
      rightSide.className = "cm-draftly-code-header-right";

      const copyBtn = document.createElement("button");
      copyBtn.className = "cm-draftly-code-copy-btn";
      copyBtn.type = "button";
      copyBtn.title = "Copy code";
      copyBtn.innerHTML = COPY_ICON;

      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.copyToClipboard(copyBtn);
      });

      rightSide.appendChild(copyBtn);
      header.appendChild(rightSide);
    }

    return header;
  }

  /**
   * Handle to the pending "copied" reset.
   *
   * Tracked so a rapid second click restarts it rather than racing it, and so
   * {@link destroy} can cancel it instead of letting it fire against a detached button.
   */
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  override destroy(): void {
    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Copy the block's code, showing the outcome on the button.
   *
   * `navigator.clipboard.writeText` rejects when permission is denied, when the document
   * is not focused, and over plain HTTP — all of which a docs-site playground in an
   * iframe hits routinely. It used to have no `.catch()` at all, so the failure was an
   * unhandled rejection and a button that silently did nothing.
   *
   * @param copyBtn - The button to reflect state on
   */
  private copyToClipboard(copyBtn: HTMLButtonElement): void {
    const showResult = (className: string, icon: string, title: string) => {
      if (!copyBtn.isConnected) return;

      copyBtn.classList.remove("copied", "copy-failed");
      copyBtn.classList.add(className);
      copyBtn.innerHTML = icon;
      copyBtn.title = title;

      if (this.resetTimer !== null) clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => {
        this.resetTimer = null;
        if (!copyBtn.isConnected) return;
        copyBtn.classList.remove("copied", "copy-failed");
        copyBtn.innerHTML = COPY_ICON;
        copyBtn.title = "Copy code";
      }, COPY_RESET_DELAY);
    };

    navigator.clipboard
      .writeText(this.codeContent)
      .then(() => showResult("copied", CHECK_ICON, "Copied"))
      .catch(() => showResult("copy-failed", CROSS_ICON, "Copy failed"));
  }

  /** Checks equality for widget reuse optimization. */
  override eq(other: CodeBlockHeaderWidget): boolean {
    return (
      this.props.title === other.props.title &&
      this.props.language === other.props.language &&
      this.props.copy === other.props.copy &&
      this.codeContent === other.codeContent
    );
  }

  /** Allow click events to propagate for copy button interaction. */
  override ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Widget for code block caption.
 * Displays descriptive text below the code block.
 */
class CodeBlockCaptionWidget extends WidgetType {
  constructor(private caption: string) {
    super();
  }

  /** Creates the caption DOM element. */
  toDOM(): HTMLElement {
    const captionEl = document.createElement("div");
    captionEl.className = "cm-draftly-code-caption";
    captionEl.textContent = this.caption;
    return captionEl;
  }

  /** Checks equality for widget reuse optimization. */
  override eq(other: CodeBlockCaptionWidget): boolean {
    return this.caption === other.caption;
  }

  /** Allow click events to propagate for caption interaction. */
  override ignoreEvent(): boolean {
    return false;
  }
}

// ============================================================================
// Plugin
// ============================================================================

/**
 * CodePlugin - Handles inline code and fenced code blocks.
 *
 * **Inline code:** `code`
 * Hides backticks when cursor is not in range.
 *
 * **Fenced code blocks:**
 * Supports syntax highlighting, line numbers, line/text highlighting,
 * title, caption, and copy button via CodeInfo properties.
 *
 * @example
 * ```tsx line-numbers{5} title="example.tsx" {2-4} /pattern/
 * const x = 1;
 * ```
 */
export class CodePlugin extends DecorationPlugin {
  readonly name = "code";
  readonly version = "1.0.0";
  override decorationPriority = 25;
  override readonly requiredNodes = ["InlineCode", "FencedCode", "CodeMark", "CodeInfo", "CodeText"] as const;
  private readonly parserCache = new Map<string, Promise<Parser | null>>();

  /**
   * Plugin theme
   */
  override get theme() {
    return theme;
  }

  /**
   * Keyboard shortcuts for code formatting
   */
  override getKeymap(): DescribedKeyBinding[] {
    return [
      {
        name: "Inline code",
        description: "Wrap the selection in backticks",
        key: "Mod-e",
        run: toggleMarkdownStyle("`"),
        preventDefault: true,
      },
      {
        name: "Code block",
        description: "Wrap the selection in a fenced code block",
        key: "Mod-Shift-e",
        run: (view) => this.toggleCodeBlock(view),
        preventDefault: true,
      },
    ];
  }

  /**
   * Intercepts backtick typing to wrap selected text as inline code.
   *
   * If user types '`' while text is selected, wraps each selected range
   * with backticks (selected -> `selected`).
   */
  override getExtensions(): Extension[] {
    return [createWrapSelectionInputHandler({ "`": "`" })];
  }

  /**
   * Toggle code block on current line or selected lines
   */
  private toggleCodeBlock(view: EditorView): boolean {
    const { state } = view;
    const { from, to } = state.selection.main;

    // Get all lines in selection
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);

    // Check if lines are already in a code block
    const prevLineNum = startLine.number > 1 ? startLine.number - 1 : startLine.number;
    const nextLineNum = endLine.number < state.doc.lines ? endLine.number + 1 : endLine.number;

    const prevLine = state.doc.line(prevLineNum);
    const nextLine = state.doc.line(nextLineNum);

    const isWrapped =
      prevLine.text.trim().startsWith(CODE_FENCE) &&
      nextLine.text.trim() === CODE_FENCE &&
      prevLineNum !== startLine.number &&
      nextLineNum !== endLine.number;

    if (isWrapped) {
      // Remove the fence lines
      view.dispatch({
        changes: [
          { from: prevLine.from, to: prevLine.to + 1, insert: "" }, // Remove opening fence + newline
          { from: nextLine.from - 1, to: nextLine.to, insert: "" }, // Remove newline + closing fence
        ],
      });
    } else {
      // Wrap with code fence
      const openFence = `${CODE_FENCE}\n`;
      const closeFence = `\n${CODE_FENCE}`;

      view.dispatch({
        changes: [
          { from: startLine.from, insert: openFence },
          { from: endLine.to, insert: closeFence },
        ],
        selection: { anchor: startLine.from + openFence.length, head: endLine.to + openFence.length },
      });
    }

    return true;
  }

  /**
   * Parse CodeInfo string into structured properties
   *
   * @param codeInfo - The raw CodeInfo string (e.g., "tsx line-numbers{5} title=\"hello.tsx\" copy {2-4,5} /Hello/3-5")
   * @returns Parsed CodeBlockProperties object
   *
   * @example
   * ```typescript
   * parseCodeInfo("tsx line-numbers{5} title=\"hello.tsx\" copy {2-4,5} /Hello/3-5")
   * ```
   *
   * Returns:
   * ```json
   * {
   *   language: "tsx",
   *   lineNumbers: 5,
   *   title: "hello.tsx",
   *   copy: true,
   *   diff: false,
   *   highlightLines: [2,3,4,5],
   *   highlightText: [{ pattern: "Hello", instances: [3,4,5] }]
   * }
   * ```
   */
  parseCodeInfo(codeInfo: string): CodeBlockProperties {
    const props: CodeBlockProperties = { language: "" };

    if (!codeInfo || !codeInfo.trim()) {
      return props;
    }

    let remaining = codeInfo.trim();

    // Extract language (first token), but only when it isn't a known directive.
    const firstTokenMatch = remaining.match(/^([^\s]+)/);
    if (firstTokenMatch && firstTokenMatch[1]) {
      const firstToken = firstTokenMatch[1];
      const normalizedToken = firstToken.toLowerCase();
      const isLineNumberDirective = /^(?:line-numbers|linenumbers|showlinenumbers)(?:\{\d+\})?$/.test(normalizedToken);
      const isKnownDirective =
        isLineNumberDirective ||
        normalizedToken === "copy" ||
        normalizedToken === "diff" ||
        normalizedToken.startsWith("{") ||
        normalizedToken.startsWith("/");

      if (!isKnownDirective) {
        props.language = firstToken;
        remaining = remaining.slice(firstToken.length).trim();
      }
    }

    // Extract quoted values (title="..." caption="...")
    let quotedMatch: RegExpExecArray | null;
    while ((quotedMatch = QUOTED_INFO_PATTERN.exec(remaining)) !== null) {
      const key = quotedMatch[1]?.toLowerCase();
      const value = quotedMatch[2];

      if (key === "title" && value !== undefined) {
        props.title = value;
      } else if (key === "caption" && value !== undefined) {
        props.caption = value;
      }
    }
    // Remove matched quoted values
    remaining = remaining.replace(QUOTED_INFO_PATTERN, "").trim();

    // Check for line numbers with optional start value.
    // Supports both `line-numbers` and legacy `showLineNumbers` tokens.
    const lineNumbersMatch = remaining.match(/\b(?:line-numbers|lineNumbers|showLineNumbers)(?:\{(\d+)\})?/i);
    if (lineNumbersMatch) {
      if (lineNumbersMatch[1]) {
        props.showLineNumbers = Number.parseInt(lineNumbersMatch[1], 10);
      } else {
        props.showLineNumbers = true;
      }
      remaining = remaining.replace(lineNumbersMatch[0], "").trim();
    }

    // Check for copy flag
    if (/\bcopy\b/.test(remaining)) {
      props.copy = true;
      remaining = remaining.replace(/\bcopy\b/, "").trim();
    }

    // Check for diff flag
    if (/\bdiff\b/.test(remaining)) {
      props.diff = true;
      remaining = remaining.replace(/\bdiff\b/, "").trim();
    }

    // Extract line highlights {2-4,5,9}
    const lineHighlightMatch = remaining.match(/\{([^}]+)\}/);
    if (lineHighlightMatch && lineHighlightMatch[1]) {
      const highlightLines = this.parseNumberList(lineHighlightMatch[1]);

      if (highlightLines.length > 0) {
        props.highlightLines = highlightLines;
      }
      remaining = remaining.replace(lineHighlightMatch[0], "").trim();
    }

    // Extract text/regex highlights /pattern/ or /pattern/3-5 or /pattern/3,5
    let textMatch: RegExpExecArray | null;
    const highlightText: TextHighlight[] = [];

    while ((textMatch = TEXT_HIGHLIGHT_PATTERN.exec(remaining)) !== null) {
      if (!textMatch[1]) continue;
      const highlight: TextHighlight = {
        pattern: textMatch[1],
      };

      // Parse instance selection if present
      if (textMatch[2]) {
        const instances = this.parseNumberList(textMatch[2]);

        if (instances.length > 0) {
          highlight.instances = instances;
        }
      }

      highlightText.push(highlight);
    }

    if (highlightText.length > 0) {
      props.highlightText = highlightText;
    }

    return props;
  }

  /**
   * Build decorations for inline code and fenced code blocks.
   * Handles line numbers, highlights, header/caption widgets, and fence visibility.
   */
  buildDecorations(ctx: DecorationContext): void {
    // Scoped to the viewport: an unbounded walk makes every update -- including a
    // plain cursor move -- cost O(document). See DecorationContext.iterateVisible.
    ctx.iterateVisible({
      enter: (node) => {
        if (node.name === "InlineCode") {
          this.decorateInlineCode(node, ctx);
          return;
        }

        if (node.name === "FencedCode") {
          this.decorateFencedCode(node, ctx);
        }
      },
    });
  }

  private decorateInlineCode(node: { from: number; to: number; node: SyntaxNode }, ctx: DecorationContext): void {
    const { from, to } = node;
    ctx.decorations.push(codeMarkDecorations["inline-code"].range(from, to));

    if (ctx.selectionOverlapsRange(from, to)) {
      return;
    }

    for (let child = node.node.firstChild; child; child = child.nextSibling) {
      if (child.name === "CodeMark") {
        ctx.decorations.push(codeMarkDecorations["inline-mark"].range(child.from, child.to));
      }
    }
  }

  private decorateFencedCode(node: { from: number; to: number; node: SyntaxNode }, ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    const nodeLineStart = view.state.doc.lineAt(node.from);
    const nodeLineEnd = view.state.doc.lineAt(node.to);
    // Two distinct questions that used to share one answer. Line-level styling
    // relaxes whenever the caret is anywhere in the block, but the ``` fences
    // should only reappear when the caret is on a fence line itself.
    const cursorInCodeBlock = ctx.selectionOverlapsRange(nodeLineStart.from, nodeLineEnd.to);
    const cursorOnFenceLine =
      ctx.selectionOverlapsRange(nodeLineStart.from, nodeLineStart.to) ||
      ctx.selectionOverlapsRange(nodeLineEnd.from, nodeLineEnd.to);

    let infoProps: CodeBlockProperties = { language: "" };
    let codeContent = "";

    for (let child = node.node.firstChild; child; child = child.nextSibling) {
      if (child.name === "CodeInfo") {
        infoProps = this.parseCodeInfo(view.state.sliceDoc(child.from, child.to).trim());
      }
      if (child.name === "CodeText") {
        codeContent = view.state.sliceDoc(child.from, child.to);
      }
    }

    const codeLines: string[] = [];
    for (let i = nodeLineStart.number + 1; i <= nodeLineEnd.number - 1; i++) {
      const codeLine = view.state.doc.line(i);
      codeLines.push(view.state.sliceDoc(codeLine.from, codeLine.to));
    }

    const totalCodeLines = nodeLineEnd.number - nodeLineStart.number - 1;
    const startLineNum = typeof infoProps.showLineNumbers === "number" ? infoProps.showLineNumbers : 1;
    const maxLineNum = startLineNum + totalCodeLines - 1;
    const lineNumWidth = Math.max(String(maxLineNum).length, String(startLineNum).length);
    const highlightInstanceCounters = new Array(infoProps.highlightText?.length ?? 0).fill(0);

    const diffStates = infoProps.diff ? this.analyzeDiffLines(codeLines) : [];
    const diffDisplayLineNumbers = infoProps.diff ? this.computeDiffDisplayLineNumbers(diffStates, startLineNum) : [];
    const displayLineNumbers = infoProps.diff
      ? diffDisplayLineNumbers.map((numbers, index) => numbers.newLine ?? numbers.oldLine ?? startLineNum + index)
      : codeLines.map((_, index) => startLineNum + index);
    const diffHighlightLineNumbers = infoProps.diff
      ? this.computeDiffDisplayLineNumbers(diffStates, startLineNum).map(
          (numbers, index) => numbers.newLine ?? numbers.oldLine ?? startLineNum + index
        )
      : [];
    const maxOldDiffLineNum = diffDisplayLineNumbers.reduce((max, numbers) => {
      const oldLine = numbers.oldLine ?? 0;
      return oldLine > max ? oldLine : max;
    }, startLineNum);
    const maxNewDiffLineNum = diffDisplayLineNumbers.reduce((max, numbers) => {
      const newLine = numbers.newLine ?? 0;
      return newLine > max ? newLine : max;
    }, startLineNum);
    const diffOldLineNumWidth = Math.max(String(startLineNum).length, String(maxOldDiffLineNum).length);
    const diffNewLineNumWidth = Math.max(String(startLineNum).length, String(maxNewDiffLineNum).length);

    // Header and caption are chrome, not syntax: they stay put while editing so
    // that clicking into a block does not shift every line under the cursor.
    const shouldShowHeader = !!(infoProps.title || infoProps.copy || infoProps.language);
    const shouldShowCaption = !!infoProps.caption;

    if (shouldShowHeader) {
      decorations.push(
        Decoration.widget({
          widget: new CodeBlockHeaderWidget(infoProps, codeContent),
          block: false,
          side: -1,
        }).range(nodeLineStart.from)
      );
    }

    let codeLineIndex = 0;
    for (let lineNumber = nodeLineStart.number; lineNumber <= nodeLineEnd.number; lineNumber++) {
      const line = view.state.doc.line(lineNumber);
      const isFenceLine = lineNumber === nodeLineStart.number || lineNumber === nodeLineEnd.number;
      const relativeLineNum = displayLineNumbers[codeLineIndex] ?? startLineNum + codeLineIndex;

      decorations.push(codeMarkDecorations["code-block-line"].range(line.from));

      if (lineNumber === nodeLineStart.number) {
        decorations.push(codeMarkDecorations["code-block-line-start"].range(line.from));
        if (shouldShowHeader) {
          decorations.push(Decoration.line({ class: "cm-draftly-code-block-has-header" }).range(line.from));
        }
      }

      if (lineNumber === nodeLineEnd.number) {
        decorations.push(codeMarkDecorations["code-block-line-end"].range(line.from));
        if (shouldShowCaption) {
          decorations.push(Decoration.line({ class: "cm-draftly-code-block-has-caption" }).range(line.from));
        }
      }

      if (!isFenceLine && infoProps.showLineNumbers && !infoProps.diff) {
        decorations.push(
          Decoration.line({
            class: "cm-draftly-code-line-numbered",
            attributes: {
              "data-line-num": String(relativeLineNum),
              style: `--line-num-width: ${lineNumWidth}ch`,
            },
          }).range(line.from)
        );
      }

      if (!isFenceLine && infoProps.showLineNumbers && infoProps.diff) {
        const diffLineNumbers = diffDisplayLineNumbers[codeLineIndex];
        const diffState = diffStates[codeLineIndex];
        const diffMarker = diffState?.kind === "addition" ? "+" : diffState?.kind === "deletion" ? "-" : " ";
        decorations.push(
          Decoration.line({
            class: "cm-draftly-code-line-numbered-diff",
            attributes: {
              "data-line-num-old": diffLineNumbers?.oldLine != null ? String(diffLineNumbers.oldLine) : "",
              "data-line-num-new": diffLineNumbers?.newLine != null ? String(diffLineNumbers.newLine) : "",
              "data-diff-marker": diffMarker,
              style: `--line-num-old-width: ${diffOldLineNumWidth}ch; --line-num-new-width: ${diffNewLineNumWidth}ch`,
            },
          }).range(line.from)
        );
      }

      if (!isFenceLine && infoProps.diff) {
        this.decorateDiffLine(
          line,
          codeLineIndex,
          diffStates,
          cursorInCodeBlock,
          !infoProps.showLineNumbers,
          decorations
        );
      }

      if (!isFenceLine && infoProps.highlightLines) {
        const highlightLineNumber = infoProps.diff
          ? (diffHighlightLineNumbers[codeLineIndex] ?? codeLineIndex + 1)
          : startLineNum + codeLineIndex;
        if (infoProps.highlightLines.includes(highlightLineNumber)) {
          decorations.push(codeMarkDecorations["code-line-highlight"].range(line.from));
        }
      }

      if (!isFenceLine && infoProps.highlightText?.length) {
        this.decorateTextHighlights(
          line.from,
          view.state.sliceDoc(line.from, line.to),
          infoProps.highlightText,
          highlightInstanceCounters,
          decorations
        );
      }

      if (!isFenceLine) {
        codeLineIndex++;
      }
    }

    this.decorateFenceMarkers(node.node, cursorOnFenceLine, decorations);

    // Same condition as shouldShowCaption, written against the field so that
    // TypeScript narrows it for the widget.
    if (infoProps.caption) {
      decorations.push(
        Decoration.widget({
          widget: new CodeBlockCaptionWidget(infoProps.caption),
          block: false,
          side: 1,
        }).range(nodeLineEnd.to)
      );
    }
  }

  private decorateFenceMarkers(
    node: SyntaxNode,
    showFenceMarkers: boolean,
    decorations: DecorationContext["decorations"]
  ): void {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "CodeMark" || child.name === "CodeInfo") {
        decorations.push(
          (showFenceMarkers ? codeMarkDecorations["code-fence"] : codeMarkDecorations["code-hidden"]).range(
            child.from,
            child.to
          )
        );
      }
    }
  }

  private decorateDiffLine(
    line: { from: number; to: number },
    codeLineIndex: number,
    diffStates: DiffLineState[],
    cursorInRange: boolean,
    showDiffMarkerGutter: boolean,
    decorations: DecorationContext["decorations"]
  ): void {
    const diffState = diffStates[codeLineIndex];
    const diffMarker = diffState?.kind === "addition" ? "+" : diffState?.kind === "deletion" ? "-" : " ";

    if (showDiffMarkerGutter) {
      decorations.push(
        Decoration.line({
          class: "cm-draftly-code-line-diff-gutter",
          attributes: {
            "data-diff-marker": diffMarker,
          },
        }).range(line.from)
      );
    }

    if (diffState?.kind === "addition") {
      decorations.push(codeMarkDecorations["diff-line-add"].range(line.from));
      if (cursorInRange && line.to > line.from) {
        decorations.push(codeMarkDecorations["diff-sign-add"].range(line.from, line.from + 1));
      }
    }

    if (diffState?.kind === "deletion") {
      decorations.push(codeMarkDecorations["diff-line-del"].range(line.from));
      if (cursorInRange && line.to > line.from) {
        decorations.push(codeMarkDecorations["diff-sign-del"].range(line.from, line.from + 1));
      }
    }

    if (
      !cursorInRange &&
      line.to > line.from &&
      (diffState?.escapedMarker || diffState?.kind === "addition" || diffState?.kind === "deletion")
    ) {
      decorations.push(codeMarkDecorations["diff-escape-hidden"].range(line.from, line.from + 1));
    }

    if (diffState?.modificationRanges?.length) {
      for (const [start, end] of diffState.modificationRanges) {
        const rangeFrom = line.from + diffState.contentOffset + start;
        const rangeTo = line.from + diffState.contentOffset + end;
        if (rangeTo > rangeFrom) {
          decorations.push(
            (diffState.kind === "addition"
              ? codeMarkDecorations["diff-mod-add"]
              : codeMarkDecorations["diff-mod-del"]
            ).range(rangeFrom, rangeTo)
          );
        }
      }
    }
  }

  private decorateTextHighlights(
    lineFrom: number,
    lineText: string,
    highlights: TextHighlight[],
    instanceCounters: number[],
    decorations: DecorationContext["decorations"]
  ): void {
    for (const [highlightIndex, textHighlight] of highlights.entries()) {
      try {
        const regex = new RegExp(textHighlight.pattern, "g");
        let match: RegExpExecArray | null;

        while ((match = regex.exec(lineText)) !== null) {
          instanceCounters[highlightIndex] = (instanceCounters[highlightIndex] ?? 0) + 1;
          const globalMatchIndex = instanceCounters[highlightIndex];
          const shouldHighlight = !textHighlight.instances || textHighlight.instances.includes(globalMatchIndex);

          if (shouldHighlight) {
            const matchFrom = lineFrom + match.index;
            const matchTo = matchFrom + match[0].length;
            decorations.push(codeMarkDecorations["code-text-highlight"].range(matchFrom, matchTo));
          }
        }
      } catch {
        // Invalid regex; ignore this highlight pattern.
      }
    }
  }

  /**
   * Render code elements to HTML for static preview.
   * Applies syntax highlighting using @lezer/highlight.
   */
  override async renderToHTML(node: SyntaxNode, _children: string, ctx: PreviewRenderContext): Promise<string | null> {
    // Hide CodeMark (backticks)
    if (node.name === "CodeMark") {
      return "";
    }

    // Inline code
    if (node.name === "InlineCode") {
      // Extract content without backticks
      let content = ctx.sliceDoc(node.from, node.to);
      // Remove leading and trailing backticks
      const match = content.match(/^`+(.+?)`+$/s);
      if (match && match[1]) {
        content = match[1];
      }
      return `<code class="cm-draftly-code-inline" style="padding: 0.1rem 0.25rem">${this.escapeHtml(content)}</code>`;
    }

    // Fenced code block
    if (node.name === "FencedCode") {
      const content = ctx.sliceDoc(node.from, node.to);
      const lines = content.split("\n");

      // Extract info string from first line (everything after ```)
      const firstLine = lines[0] || "";
      const infoMatch = firstLine.match(/^```(.*)$/);
      const infoString = infoMatch?.[1]?.trim() || "";

      // Parse properties from info string
      const props = this.parseCodeInfo(infoString);

      // Get code content (without fence lines)
      const codeLines = lines.slice(1, -1);
      const code = codeLines.join("\n");

      // Build HTML parts
      let html = "";

      // Wrapper container
      html += `<div class="cm-draftly-code-container">`;

      // Header (if title, copy, or language is set)
      const showHeader = props.title || props.copy || props.language;
      if (showHeader) {
        html += `<div class="cm-draftly-code-header">`;
        html += `<div class="cm-draftly-code-header-left">`;
        if (props.title) {
          html += `<span class="cm-draftly-code-header-title">${this.escapeHtml(props.title)}</span>`;
        } else if (props.language) {
          html += `<span class="cm-draftly-code-header-lang">${this.escapeHtml(props.language)}</span>`;
        }
        html += "</div>";
        if (props.copy !== false) {
          html += `<div class="cm-draftly-code-header-right">`;
          // Encode code as base64 to safely store in data attribute (preserves newlines and special chars)
          const encodedCode =
            typeof btoa !== "undefined" ? btoa(encodeURIComponent(code)) : Buffer.from(code).toString("base64");
          html += `<button class="cm-draftly-code-copy-btn" type="button" title="Copy code" data-code="${encodedCode}" data-encoded="true">`;
          html += `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
          html += "</button>";
          html += "</div>";
        }
        html += "</div>";
      }

      // Calculate line number info
      const startLineNum = typeof props.showLineNumbers === "number" ? props.showLineNumbers : 1;
      const previewHighlightCounters = new Array(props.highlightText?.length ?? 0).fill(0);
      const diffStates = props.diff ? this.analyzeDiffLines(codeLines) : [];
      const previewDiffLineNumbers = props.diff ? this.computeDiffDisplayLineNumbers(diffStates, startLineNum) : [];
      const previewLineNumbers = props.diff
        ? previewDiffLineNumbers.map((numbers, index) => numbers.newLine ?? numbers.oldLine ?? startLineNum + index)
        : codeLines.map((_, index) => startLineNum + index);
      const previewHighlightLineNumbers = props.diff
        ? this.computeDiffDisplayLineNumbers(diffStates, startLineNum).map(
            (numbers, index) => numbers.newLine ?? numbers.oldLine ?? startLineNum + index
          )
        : [];
      const lineNumWidth = String(Math.max(...previewLineNumbers, startLineNum)).length;
      const previewOldLineNumWidth = String(
        Math.max(...previewDiffLineNumbers.map((numbers) => numbers.oldLine ?? 0), startLineNum)
      ).length;
      const previewNewLineNumWidth = String(
        Math.max(...previewDiffLineNumbers.map((numbers) => numbers.newLine ?? 0), startLineNum)
      ).length;
      const previewContentLines = props.diff ? diffStates.map((state) => state.content) : codeLines;
      const highlightedLines = await this.highlightCodeLines(
        previewContentLines.join("\n"),
        props.language || "",
        ctx.syntaxHighlighters
      );

      // Code block with line processing
      const hasHeader = showHeader ? " cm-draftly-code-block-has-header" : "";
      const hasCaption = props.caption ? " cm-draftly-code-block-has-caption" : "";
      html += `<pre class="cm-draftly-code-block${hasHeader}${hasCaption}"${props.language ? ` data-lang="${this.escapeAttribute(props.language)}"` : ""}>`;
      html += "<code>";

      // Process each line
      codeLines.forEach((line, index) => {
        const lineNum = previewLineNumbers[index] ?? startLineNum + index;
        const highlightLineNumber = props.diff
          ? (previewHighlightLineNumbers[index] ?? startLineNum + index)
          : startLineNum + index;
        const isHighlighted = props.highlightLines?.includes(highlightLineNumber);
        const diffState = props.diff ? diffStates[index] : undefined;
        const diffLineNumbers = props.diff ? previewDiffLineNumbers[index] : undefined;

        // Line classes
        const lineClasses: string[] = ["cm-draftly-code-line"];
        if (isHighlighted) lineClasses.push("cm-draftly-code-line-highlight");
        if (props.showLineNumbers) {
          lineClasses.push(props.diff ? "cm-draftly-code-line-numbered-diff" : "cm-draftly-code-line-numbered");
        }
        if (diffState?.kind === "addition") lineClasses.push("cm-draftly-code-line-diff-add");
        if (diffState?.kind === "deletion") lineClasses.push("cm-draftly-code-line-diff-del");

        // Line attributes
        const lineAttrs: string[] = [`class="${lineClasses.join(" ")}"`];
        if (props.showLineNumbers && !props.diff) {
          lineAttrs.push(`data-line-num="${lineNum}"`);
          lineAttrs.push(`style="--line-num-width: ${lineNumWidth}ch"`);
        }
        if (props.diff) {
          const diffMarker = diffState?.kind === "addition" ? "+" : diffState?.kind === "deletion" ? "-" : " ";
          if (props.showLineNumbers) {
            lineAttrs.push(`data-line-num-old="${diffLineNumbers?.oldLine != null ? diffLineNumbers.oldLine : ""}"`);
            lineAttrs.push(`data-line-num-new="${diffLineNumbers?.newLine != null ? diffLineNumbers.newLine : ""}"`);
            lineAttrs.push(`data-diff-marker="${diffMarker}"`);
            lineAttrs.push(
              `style="--line-num-old-width: ${previewOldLineNumWidth}ch; --line-num-new-width: ${previewNewLineNumWidth}ch"`
            );
          } else {
            lineAttrs.push(`data-diff-marker="${diffMarker}"`);
            lineClasses.push("cm-draftly-code-line-diff-gutter");
            lineAttrs[0] = `class="${lineClasses.join(" ")}"`;
          }
        }

        // Highlight text content
        const highlightedLine = highlightedLines[index] ?? this.escapeHtml(previewContentLines[index] ?? line);
        let lineContent = highlightedLine;

        if (diffState) {
          lineContent = this.renderDiffPreviewLine(diffState, highlightedLine);
        }

        // Apply text highlights
        if (props.highlightText && props.highlightText.length > 0) {
          lineContent = this.applyTextHighlights(lineContent, props.highlightText, previewHighlightCounters);
        }

        html += `<span ${lineAttrs.join(" ")}>${lineContent || " "}</span>`;
      });

      html += "</code></pre>";

      // Caption
      if (props.caption) {
        html += `<div class="cm-draftly-code-caption">${this.escapeHtml(props.caption)}</div>`;
      }

      // Close wrapper container
      html += "</div>";

      return html;
    }

    // Hide CodeInfo and CodeText - they're handled by FencedCode
    if (node.name === "CodeInfo" || node.name === "CodeText") {
      return "";
    }

    return null;
  }

  /** Parse comma-separated numbers and ranges (e.g. "1,3-5") into [1,3,4,5]. */
  private parseNumberList(value: string): number[] {
    const result: number[] = [];

    for (const part of value.split(",")) {
      const trimmed = part.trim();
      const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);

      if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
        const start = Number.parseInt(rangeMatch[1], 10);
        const end = Number.parseInt(rangeMatch[2], 10);
        for (let i = start; i <= end; i++) {
          result.push(i);
        }
        continue;
      }

      if (/^\d+$/.test(trimmed)) {
        result.push(Number.parseInt(trimmed, 10));
      }
    }

    return result;
  }

  /**
   * Highlight a single line of code using the language's Lezer parser.
   * Falls back to sanitized plain text if the language is not supported.
   */
  private async highlightCodeLines(
    code: string,
    lang: string,
    syntaxHighlighters?: readonly Highlighter[]
  ): Promise<string[]> {
    const rawLines = code.split("\n");
    if (!lang || !code) {
      return rawLines.map((line) => this.escapeHtml(line));
    }

    const parser = await this.resolveLanguageParser(lang);
    if (!parser) {
      return rawLines.map((line) => this.escapeHtml(line));
    }

    try {
      const tree = parser.parse(code);
      const highlightedLines: string[] = [""];

      highlightCode(
        code,
        tree,
        syntaxHighlighters && syntaxHighlighters.length > 0 ? syntaxHighlighters : [],
        (text, classes) => {
          const chunk = classes
            ? `<span class="${this.escapeAttribute(classes)}">${this.escapeHtml(text)}</span>`
            : this.escapeHtml(text);
          highlightedLines[highlightedLines.length - 1] += chunk;
        },
        () => {
          highlightedLines.push("");
        }
      );

      return rawLines.map((line, index) => highlightedLines[index] || this.escapeHtml(line));
    } catch {
      return rawLines.map((line) => this.escapeHtml(line));
    }
  }

  private async resolveLanguageParser(lang: string): Promise<Parser | null> {
    const normalizedLang = this.normalizeLanguage(lang);
    if (!normalizedLang) return null;

    const cached = this.parserCache.get(normalizedLang);
    if (cached) return cached;

    const parserPromise = (async () => {
      const langDesc = LanguageDescription.matchLanguageName(languages, normalizedLang, true);

      if (!langDesc) return null;

      if (langDesc.support) {
        return langDesc.support.language.parser;
      }

      if (typeof langDesc.load === "function") {
        try {
          const support = await langDesc.load();
          return support.language.parser;
        } catch {
          return null;
        }
      }

      return null;
    })();

    this.parserCache.set(normalizedLang, parserPromise);
    return parserPromise;
  }

  private normalizeLanguage(lang: string): string {
    const normalized = lang.trim().toLowerCase();
    if (!normalized) return "";

    const normalizedMap: Record<string, string> = {
      "c++": "cpp",
      "c#": "csharp",
      "f#": "fsharp",
      py: "python",
      js: "javascript",
      ts: "typescript",
      sh: "shell",
    };

    return normalizedMap[normalized] ?? normalized;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value).replace(/`/g, "&#96;");
  }

  private analyzeDiffLines(lines: string[]): DiffLineState[] {
    const states = lines.map((line) => this.parseDiffLineState(line));

    let index = 0;
    while (index < states.length) {
      if (states[index]?.kind !== "deletion") {
        index++;
        continue;
      }

      const deletionStart = index;
      while (index < states.length && states[index]?.kind === "deletion") {
        index++;
      }
      const deletionEnd = index;

      const additionStart = index;
      while (index < states.length && states[index]?.kind === "addition") {
        index++;
      }
      const additionEnd = index;

      if (additionStart === additionEnd) {
        continue;
      }

      const pairCount = Math.min(deletionEnd - deletionStart, additionEnd - additionStart);
      for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
        const deletionState = states[deletionStart + pairIndex];
        const additionState = states[additionStart + pairIndex];

        if (!deletionState || !additionState) {
          continue;
        }

        const ranges = this.computeChangedRanges(deletionState.content, additionState.content);
        if (ranges.oldRanges.length > 0) {
          deletionState.modificationRanges = ranges.oldRanges;
        }
        if (ranges.newRanges.length > 0) {
          additionState.modificationRanges = ranges.newRanges;
        }
      }
    }

    return states;
  }

  private computeDiffDisplayLineNumbers(states: DiffLineState[], startLineNum: number): DiffDisplayLineNumbers[] {
    const numbers: DiffDisplayLineNumbers[] = [];
    let oldLineNumber = startLineNum;
    let newLineNumber = startLineNum;

    for (const state of states) {
      if (state.kind === "deletion") {
        numbers.push({ oldLine: oldLineNumber, newLine: null });
        oldLineNumber++;
        continue;
      }

      if (state.kind === "addition") {
        numbers.push({ oldLine: null, newLine: newLineNumber });
        newLineNumber++;
        continue;
      }

      numbers.push({ oldLine: oldLineNumber, newLine: newLineNumber });
      oldLineNumber++;
      newLineNumber++;
    }

    return numbers;
  }

  private parseDiffLineState(line: string): DiffLineState {
    const escapedMarker = line.startsWith("\\+") || line.startsWith("\\-");

    if (escapedMarker) {
      return {
        kind: "normal",
        content: line.slice(1),
        contentOffset: 1,
        escapedMarker: true,
      };
    }

    if (line.startsWith("+")) {
      return {
        kind: "addition",
        content: line.slice(1),
        contentOffset: 1,
        escapedMarker: false,
      };
    }

    if (line.startsWith("-")) {
      return {
        kind: "deletion",
        content: line.slice(1),
        contentOffset: 1,
        escapedMarker: false,
      };
    }

    return {
      kind: "normal",
      content: line,
      contentOffset: 0,
      escapedMarker: false,
    };
  }

  private computeChangedRanges(
    oldText: string,
    newText: string
  ): { oldRanges: Array<[number, number]>; newRanges: Array<[number, number]> } {
    let prefix = 0;
    while (prefix < oldText.length && prefix < newText.length && oldText[prefix] === newText[prefix]) {
      prefix++;
    }

    let oldSuffix = oldText.length;
    let newSuffix = newText.length;
    while (oldSuffix > prefix && newSuffix > prefix && oldText[oldSuffix - 1] === newText[newSuffix - 1]) {
      oldSuffix--;
      newSuffix--;
    }

    const oldRanges: Array<[number, number]> = [];
    const newRanges: Array<[number, number]> = [];

    if (oldSuffix > prefix) {
      oldRanges.push([prefix, oldSuffix]);
    }
    if (newSuffix > prefix) {
      newRanges.push([prefix, newSuffix]);
    }

    return { oldRanges, newRanges };
  }

  private renderDiffPreviewLine(diffState: DiffLineState, highlightedContent: string): string {
    const modClass =
      diffState.kind === "addition"
        ? "cm-draftly-code-diff-mod-add"
        : diffState.kind === "deletion"
          ? "cm-draftly-code-diff-mod-del"
          : "";

    const baseHighlightedContent = highlightedContent || this.escapeHtml(diffState.content);

    const contentHtml =
      diffState.modificationRanges && modClass
        ? this.applyRangesToHighlightedHTML(baseHighlightedContent, diffState.modificationRanges, modClass)
        : baseHighlightedContent;

    return contentHtml || " ";
  }

  private applyRangesToHighlightedHTML(
    htmlContent: string,
    ranges: Array<[number, number]>,
    className: string
  ): string {
    const normalizedRanges = ranges
      .map(([start, end]) => [Math.max(0, start), Math.max(0, end)] as [number, number])
      .filter(([start, end]) => end > start)
      .sort((a, b) => a[0] - b[0]);

    if (normalizedRanges.length === 0 || !htmlContent) {
      return htmlContent;
    }

    const isInsideRange = (position: number) => {
      for (const [start, end] of normalizedRanges) {
        if (position >= start && position < end) return true;
        if (position < start) return false;
      }
      return false;
    };

    let result = "";
    let htmlIndex = 0;
    let textPosition = 0;
    let markOpen = false;

    while (htmlIndex < htmlContent.length) {
      const char = htmlContent[htmlIndex];

      if (char === "<") {
        const tagEnd = htmlContent.indexOf(">", htmlIndex);
        if (tagEnd === -1) {
          result += htmlContent.slice(htmlIndex);
          break;
        }
        result += htmlContent.slice(htmlIndex, tagEnd + 1);
        htmlIndex = tagEnd + 1;
        continue;
      }

      let token = char;
      if (char === "&") {
        const entityEnd = htmlContent.indexOf(";", htmlIndex);
        if (entityEnd !== -1) {
          token = htmlContent.slice(htmlIndex, entityEnd + 1);
          htmlIndex = entityEnd + 1;
        } else {
          htmlIndex += 1;
        }
      } else {
        htmlIndex += 1;
      }

      const shouldMark = isInsideRange(textPosition);

      if (shouldMark && !markOpen) {
        result += `<mark class="${className}">`;
        markOpen = true;
      }
      if (!shouldMark && markOpen) {
        result += "</mark>";
        markOpen = false;
      }

      result += token;
      textPosition += 1;
    }

    if (markOpen) {
      result += "</mark>";
    }

    return result;
  }

  /**
   * Apply text highlights (regex patterns) to already syntax-highlighted HTML.
   * Wraps matched patterns in `<mark>` elements.
   */
  private applyTextHighlights(htmlContent: string, highlights: TextHighlight[], instanceCounters?: number[]): string {
    let result = htmlContent;

    for (const [highlightIndex, highlight] of highlights.entries()) {
      try {
        // Create regex from pattern
        const regex = new RegExp(`(${highlight.pattern})`, "g");
        let matchCount = instanceCounters?.[highlightIndex] ?? 0;

        result = result.replace(regex, (match) => {
          matchCount++;
          // Check if this instance should be highlighted
          const shouldHighlight = !highlight.instances || highlight.instances.includes(matchCount);
          if (shouldHighlight) {
            return `<mark class="cm-draftly-code-text-highlight">${match}</mark>`;
          }
          return match;
        });

        if (instanceCounters) {
          instanceCounters[highlightIndex] = matchCount;
        }
      } catch {
        // Invalid regex, skip
      }
    }

    return result;
  }
}
