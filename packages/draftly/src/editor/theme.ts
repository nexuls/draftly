import { EditorView } from "@codemirror/view";
import type { ThemeStyle } from "./utils";

/**
 * Base styles shared by both surfaces.
 *
 * Selectors follow CodeMirror's convention: `&` is the surface root and
 * `.cm-content` the element that holds the document. The static preview has the
 * same two roles — both played by its wrapper element — so these rules can be
 * re-emitted for it, which is what keeps the two surfaces from drifting.
 * `generateCSS()` in `preview/` does that translation.
 *
 * Anything that targets a CodeMirror internal with no preview counterpart
 * belongs in {@link editorOnlyStyles} instead.
 */
export const draftlyBaseStyles: ThemeStyle = {
  "&.cm-draftly": {
    fontSize: "16px",
    lineHeight: "1.6",
    backgroundColor: "transparent !important",
  },

  "&.cm-draftly .cm-content": {
    width: "100%",
    maxWidth: "48rem",
    padding: "0 0.5rem",
    margin: "0 auto",
    fontFamily: "var(--font-sans, sans-serif)",
    fontSize: "16px",
    lineHeight: "1.6",
  },
};

/**
 * Styles that only make sense in the editor, because they address CodeMirror's
 * own DOM. Kept out of {@link draftlyBaseStyles} so the preview does not inherit
 * dead rules for elements it never renders.
 */
const editorOnlyStyles: ThemeStyle = {
  "&.cm-draftly .cm-content .cm-line": {
    paddingInline: 0,
  },

  "&.cm-draftly .cm-content .cm-widgetBuffer": {
    display: "none !important",
  },

  // The editor supplies its own caret and selection affordances; the browser's
  // focus ring on the scroller adds nothing but a box around the document.
  "&.cm-draftly.cm-focused": {
    outline: "none",
  },
};

/**
 * Base theme for draftly styling
 * Note: Layout styles are scoped under .cm-draftly which is added by the view plugin
 */
export const draftlyBaseTheme = EditorView.theme({
  ...draftlyBaseStyles,
  ...editorOnlyStyles,
});

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Reset syntax highlighting for markdown elements
 * Used to disable theme colors for markdown syntax
 */
const markdownResetStyle = HighlightStyle.define([
  {
    tag: [
      t.heading,
      t.strong,
      t.emphasis,
      t.strikethrough,
      t.link,
      t.url,
      t.quote,
      t.list,
      t.meta,
      t.contentSeparator,
      t.labelName,
    ],
    color: "inherit",
    fontWeight: "inherit",
    fontStyle: "inherit",
    textDecoration: "none",
  },
]);

export const markdownResetExtension = syntaxHighlighting(markdownResetStyle, { fallback: false });
