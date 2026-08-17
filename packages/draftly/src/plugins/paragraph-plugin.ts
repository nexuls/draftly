import type { SyntaxNode } from "@lezer/common";
import { DraftlyPlugin } from "../editor/plugin";
import { createTheme } from "../editor";

/**
 * ParagraphPlugin - Adds top and bottom padding to paragraphs in preview
 *
 * Applies visual spacing to markdown paragraphs for better readability
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

  override renderToHTML(node: SyntaxNode, children: string): string | null {
    if (node.name !== "Paragraph") {
      return null;
    }

    return `<p class="cm-draftly-paragraph">${children}</p>`;
  }
}

const theme = createTheme({
  default: {
    ".cm-draftly-paragraph": {
      paddingTop: "0.5em",
      paddingBottom: "0.5em",
    },
  },
});
