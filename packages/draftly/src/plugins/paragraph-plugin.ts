import { Decoration } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { type DecorationContext, DraftlyPlugin } from "../editor/plugin";
import { createTheme } from "../editor";

/**
 * Hoisted: allocating these per paragraph per keystroke is a measurable cost.
 *
 * Two classes rather than one, because a paragraph's source can span several
 * lines. Marking every line with a single class that carries both paddings would
 * insert a full gap between each of them; the spacing belongs at the edges.
 */
const paragraphStart = Decoration.line({ class: "cm-draftly-paragraph-start" });
const paragraphEnd = Decoration.line({ class: "cm-draftly-paragraph-end" });

/**
 * ParagraphPlugin - Applies paragraph spacing on both surfaces
 *
 * The preview wraps paragraphs in `<p class="cm-draftly-paragraph">`, but the
 * editor has no element to hang that class on — the document is a flat list of
 * lines. Marking each line of a paragraph with the same class is what keeps the
 * two surfaces spaced alike.
 */
export class ParagraphPlugin extends DraftlyPlugin {
  readonly name = "paragraph";
  readonly version = "1.0.0";
  override readonly requiredNodes = ["Paragraph"] as const;

  /**
   * Plugin theme for preview styling
   */
  override get theme() {
    return theme;
  }

  /**
   * Pad the first and last line of every visible paragraph.
   *
   * @param ctx - Decoration context
   * @returns Nothing; decorations are pushed into `ctx.decorations`
   */
  override buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;

    ctx.iterateVisible({
      enter: (node) => {
        if (node.name !== "Paragraph") return;

        // `node.to` can sit at the start of the line *after* the paragraph, so
        // step back one to avoid padding a line that is not part of it.
        const firstLine = view.state.doc.lineAt(node.from);
        const lastLine = view.state.doc.lineAt(Math.max(node.to - 1, node.from));

        decorations.push(paragraphStart.range(firstLine.from));
        decorations.push(paragraphEnd.range(lastLine.from));
      },
    });
  }

  override renderToHTML(node: SyntaxNode, children: string): string | null {
    if (node.name !== "Paragraph") {
      return null;
    }

    return `<p class="cm-draftly-paragraph">${children}</p>`;
  }
}

const theme = createTheme({
  default: {
    // Preview: one element carries both edges.
    ".cm-draftly-paragraph": {
      paddingTop: "0.5em",
      paddingBottom: "0.5em",
    },

    // Editor: the same spacing, split across the paragraph's first and last line.
    ".cm-draftly-paragraph-start": {
      paddingTop: "0.5em",
    },

    ".cm-draftly-paragraph-end": {
      paddingBottom: "0.5em",
    },
  },
});
