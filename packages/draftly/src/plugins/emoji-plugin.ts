import { Decoration, WidgetType } from "@codemirror/view";
import { type DecorationContext, DecorationPlugin } from "../editor/plugin";
import { createTheme } from "../editor";
import type { SyntaxNode } from "@lezer/common";
import * as emoji from "node-emoji";

function shortcodeToEmoji(raw: string): string | null {
  const rendered = emoji.emojify(raw);
  return rendered !== raw ? rendered : null;
}

class EmojiWidget extends WidgetType {
  constructor(readonly rendered: string) {
    super();
  }

  override eq(other: EmojiWidget): boolean {
    return other.rendered === this.rendered;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-draftly-emoji";
    span.textContent = this.rendered;
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Mark decorations for emoji syntax elements
 */
const emojiMarkDecorations = {
  "emoji-source": Decoration.mark({ class: "cm-draftly-emoji-source" }),
};

/**
 * EmojiPlugin - Decorates markdown emojis
 *
 * Parses and decorates emoji shortcodes like :smile:
 * - Converts valid shortcodes to Unicode emoji when cursor is outside
 * - Keeps raw shortcode visible while editing (cursor inside token)
 */
export class EmojiPlugin extends DecorationPlugin {
  readonly name = "emoji";
  readonly version = "1.0.0";
  override decorationPriority = 20;
  override readonly requiredNodes = ["Emoji", "EmojiMark"] as const;

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
   * Build emoji decorations by iterating the syntax tree
   */
  buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    // Scoped to the viewport: an unbounded walk makes every update -- including a
    // plain cursor move -- cost O(document). See DecorationContext.iterateVisible.
    ctx.iterateVisible({
      enter: (node) => {
        const { from, to, name } = node;

        if (name !== "Emoji") {
          return;
        }

        const raw = view.state.sliceDoc(from, to);
        const rendered = shortcodeToEmoji(raw);
        if (!rendered) {
          return;
        }

        const cursorInNode = ctx.selectionOverlapsRange(from, to);
        if (cursorInNode) {
          decorations.push(emojiMarkDecorations["emoji-source"].range(from, to));
          return;
        }

        decorations.push(
          Decoration.replace({
            widget: new EmojiWidget(rendered),
          }).range(from, to)
        );
      },
    });
  }

  override renderToHTML(
    node: SyntaxNode,
    children: string,
    ctx: {
      sliceDoc(from: number, to: number): string;
      sanitize(html: string): string;
      syntaxHighlighters?: readonly import("@lezer/highlight").Highlighter[];
    }
  ): string | null {
    if (node.name === "EmojiMark") {
      return "";
    }

    if (node.name !== "Emoji") {
      return null;
    }

    const raw = ctx.sliceDoc(node.from, node.to);
    const rendered = shortcodeToEmoji(raw);
    if (!rendered) {
      return `<span class="cm-draftly-emoji-source">${children}</span>`;
    }

    return `<span class="cm-draftly-emoji">${rendered}</span>`;
  }
}

const theme = createTheme({
  default: {
    ".cm-draftly-emoji": {
      fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif',
      fontVariantEmoji: "emoji",
      lineHeight: "1.2",
    },
    ".cm-draftly-emoji-source": {
      fontFamily: "inherit",
      lineHeight: "inherit",
    },
  },
});
