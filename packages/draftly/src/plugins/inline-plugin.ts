import { Decoration, type KeyBinding } from "@codemirror/view";
import { type DecorationContext, DecorationPlugin, type DescribedKeyBinding } from "../editor/plugin";
import { createTheme } from "../editor";
import type { SyntaxNode } from "@lezer/common";
import { toggleMarkdownStyle } from "../editor/utils";
import { tags } from "@lezer/highlight";
import type { MarkdownConfig, InlineParser } from "@lezer/markdown";
import type { Extension } from "@codemirror/state";
import { createWrapSelectionInputHandler } from "../lib";

/**
 * Node types for inline styling in markdown
 */
const INLINE_TYPES = {
  Emphasis: "emphasis",
  StrongEmphasis: "strong",
  Strikethrough: "strikethrough",
  Subscript: "subscript",
  Superscript: "superscript",
  Highlight: "highlight",
} as const;

/**
 * Mark decorations for inline content
 */
const inlineMarkDecorations = {
  emphasis: Decoration.mark({ class: "cm-draftly-emphasis" }),
  strong: Decoration.mark({ class: "cm-draftly-strong" }),
  strikethrough: Decoration.mark({ class: "cm-draftly-strikethrough" }),
  subscript: Decoration.mark({ class: "cm-draftly-subscript" }),
  superscript: Decoration.mark({ class: "cm-draftly-superscript" }),
  highlight: Decoration.mark({ class: "cm-draftly-highlight" }),
  // Markers (* _ ~~ ^ ~ ==)
  "inline-mark": Decoration.replace({}),
};

// Character code for '='
const EQUALS = 61;

// Punctuation regex for flanking checks (matches Unicode punctuation)
let Punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\xA1\u2010-\u2027]/;
try {
  Punctuation = /[\p{S}|\p{P}]/u;
} catch {
  // Fallback regex is used above for environments without Unicode support
}

// Delimiter type for highlight markers — enables nested inline parsing
const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

/**
 * Inline parser for highlight syntax: ==text==
 * Uses addDelimiter (like Strikethrough) so nested inline styles work.
 */
const highlightParser: InlineParser = {
  name: "Highlight",
  parse(cx, next, pos) {
    // Must start with ==
    if (next !== EQUALS || cx.char(pos + 1) !== EQUALS) return -1;
    // Don't match === (or more)
    if (cx.char(pos + 2) === EQUALS) return -1;

    // Flanking checks (same logic as Strikethrough)
    const before = cx.slice(pos - 1, pos);
    const after = cx.slice(pos + 2, pos + 3);
    const sBefore = /\s|^$/.test(before),
      sAfter = /\s|^$/.test(after);
    const pBefore = Punctuation.test(before),
      pAfter = Punctuation.test(after);

    return cx.addDelimiter(
      HighlightDelim,
      pos,
      pos + 2,
      !sAfter && (!pAfter || sBefore || pBefore),
      !sBefore && (!pBefore || sAfter || pAfter)
    );
  },
};

/**
 * InlinePlugin - Decorates inline markdown formatting
 *
 * Adds visual styling to inline elements:
 * - Emphasis (italic) - *text* or _text_
 * - Strong (bold) - **text** or __text__
 * - Strikethrough - ~~text~~
 * - Subscript - ~text~
 * - Superscript - ^text^
 * - Highlight - ==text==
 *
 * Hides formatting markers when cursor is not in the element
 */
export class InlinePlugin extends DecorationPlugin {
  readonly name = "inline";
  readonly version = "1.0.0";
  override decorationPriority = 20;
  override readonly requiredNodes = [
    "Emphasis",
    "StrongEmphasis",
    "Strikethrough",
    "Subscript",
    "Superscript",
    "Highlight",
    "EmphasisMark",
    "StrikethroughMark",
    "SubscriptMark",
    "SuperscriptMark",
    "HighlightMark",
  ] as const;
  marks: string[] = [];

  constructor() {
    super();

    for (const mark of Object.keys(INLINE_TYPES)) {
      this.marks.push(...this.getMarkerNames(mark));
    }
  }

  /**
   * Plugin theme
   */
  override get theme() {
    return theme;
  }

  /**
   * Keyboard shortcuts for inline formatting
   */
  override getKeymap(): DescribedKeyBinding[] {
    return [
      {
        name: "Bold",
        description: "Wrap the selection in ** **",
        key: "Mod-b",
        run: toggleMarkdownStyle("**"),
        preventDefault: true,
      },
      {
        name: "Italic",
        description: "Wrap the selection in * *",
        key: "Mod-i",
        run: toggleMarkdownStyle("*"),
        preventDefault: true,
      },
      {
        name: "Strikethrough",
        description: "Wrap the selection in ~~ ~~",
        key: "Mod-Shift-s",
        run: toggleMarkdownStyle("~~"),
        preventDefault: true,
      },
      {
        name: "Subscript",
        description: "Wrap the selection in ~ ~",
        key: "Mod-,",
        run: toggleMarkdownStyle("~"),
        preventDefault: true,
      },
      {
        name: "Superscript",
        description: "Wrap the selection in ^ ^",
        key: "Mod-.",
        run: toggleMarkdownStyle("^"),
        preventDefault: true,
      },
      {
        name: "Highlight",
        description: "Wrap the selection in == ==",
        key: "Mod-Shift-h",
        run: toggleMarkdownStyle("=="),
        preventDefault: true,
      },
    ];
  }

  /**
   * Intercepts inline marker typing to wrap selected text.
   *
   * If user types inline markers while text is selected, wraps each selected
   * range with the appropriate marker:
   * - * _ ~ ^ -> marker + selected + marker
   * - = -> ==selected==
   */
  override getExtensions(): Extension[] {
    return [createWrapSelectionInputHandler({ "*": "*", _: "_", "~": "~", "^": "^", "=": "==" })];
  }

  /**
   * Return markdown parser extensions for highlight syntax (==text==)
   */
  override getMarkdownConfig(): MarkdownConfig {
    return {
      defineNodes: [
        { name: "Highlight", style: tags.emphasis },
        { name: "HighlightMark", style: tags.processingInstruction },
      ],
      parseInline: [highlightParser],
    };
  }

  /**
   * Build inline decorations by iterating the syntax tree
   */
  buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    // Scoped to the viewport: an unbounded walk makes every update -- including a
    // plain cursor move -- cost O(document). See DecorationContext.iterateVisible.
    ctx.iterateVisible({
      enter: (node) => {
        const { from, to, name } = node;

        // Check if this is an inline type we handle
        const inlineType = INLINE_TYPES[name as keyof typeof INLINE_TYPES];
        if (!inlineType) {
          return;
        }

        // Add mark decoration for the content
        decorations.push(inlineMarkDecorations[inlineType].range(from, to));

        // Only hide markers when cursor is not in the element
        const cursorInNode = ctx.selectionOverlapsRange(from, to);
        if (!cursorInNode) {
          // Get the appropriate marker children based on type
          const markerNames = this.getMarkerNames(name);
          for (const markerName of markerNames) {
            const marks = node.node.getChildren(markerName);
            for (const mark of marks) {
              decorations.push(inlineMarkDecorations["inline-mark"].range(mark.from, mark.to));
            }
          }
        }
      },
    });
  }

  /**
   * Get the marker node names for a given inline type
   */
  private getMarkerNames(nodeType: string): string[] {
    switch (nodeType) {
      case "Emphasis":
      case "StrongEmphasis":
        return ["EmphasisMark"];
      case "Strikethrough":
        return ["StrikethroughMark"];
      case "Subscript":
        return ["SubscriptMark"];
      case "Superscript":
        return ["SuperscriptMark"];
      case "Highlight":
        return ["HighlightMark"];
      default:
        return [];
    }
  }

  override renderToHTML(node: SyntaxNode, children: string): string | null {
    if (this.marks.includes(node.name)) {
      return "";
    }

    const inlineType = INLINE_TYPES[node.name as keyof typeof INLINE_TYPES];
    if (!inlineType) {
      return null;
    }
    const className = inlineMarkDecorations[inlineType].spec.class as string;

    return `<span class="${className}">${children}</span>`;
  }
}

/**
 * Theme for inline styling
 */
const theme = createTheme({
  default: {
    // Emphasis (italic)
    ".cm-draftly-emphasis": {
      fontStyle: "italic",
    },

    // Strong (bold)
    ".cm-draftly-strong": {
      fontWeight: "bold",
    },

    // Strikethrough
    ".cm-draftly-strikethrough": {
      textDecoration: "line-through",
      opacity: "0.7",
    },

    // Subscript
    ".cm-draftly-subscript": {
      fontSize: "0.75em",
      verticalAlign: "sub",
    },

    // Superscript
    ".cm-draftly-superscript": {
      fontSize: "0.75em",
      verticalAlign: "super",
    },

    // Highlight
    ".cm-draftly-highlight": {
      backgroundColor: "rgba(255, 213, 0, 0.35)",
      borderRadius: "2px",
      padding: "1px 2px",
    },
  },
});
