import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { ThemeEnum } from "draftly/src";
import type { ResolvedTheme } from "@/components/theme-provider";

/**
 * Syntax colours for the "blue pencil" palette.
 *
 * Literals rather than `var(--…)` references: Draftly extracts these rules out of the
 * resolved `HighlightStyle` module and writes them into the preview stylesheet, and a
 * `var()` there would resolve against whatever page the preview CSS is pasted into. One
 * stop per theme, built eagerly, is the honest version.
 */
type SyntaxPalette = {
  comment: string;
  keyword: string;
  string: string;
  number: string;
  name: string;
  type: string;
  tag: string;
  meta: string;
  invalid: string;
};

const LIGHT: SyntaxPalette = {
  comment: "#6a7585",
  keyword: "#3a53a8",
  string: "#1f6b56",
  number: "#8a5519",
  name: "#1d2f6b",
  type: "#5b3c8c",
  tag: "#9e3826",
  meta: "#5a6475",
  invalid: "#b4291c",
};

const DARK: SyntaxPalette = {
  comment: "#8d98ab",
  keyword: "#9db4f5",
  string: "#79cfaf",
  number: "#e0b071",
  name: "#bcc9f0",
  type: "#c3a6ef",
  tag: "#f0a08e",
  meta: "#9aa4b8",
  invalid: "#ff8b7d",
};

/**
 * Build the `HighlightStyle` for one theme layer.
 *
 * @param palette - Resolved syntax colours
 * @returns A highlight style covering the tags the bundled languages emit
 */
function buildHighlightStyle(palette: SyntaxPalette): HighlightStyle {
  return HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: palette.comment, fontStyle: "italic" },
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: palette.keyword },
    { tag: [t.string, t.special(t.string), t.regexp, t.escape], color: palette.string },
    { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: palette.number },
    { tag: [t.variableName, t.propertyName, t.function(t.variableName), t.labelName], color: palette.name },
    { tag: [t.typeName, t.className, t.namespace, t.changed], color: palette.type },
    { tag: [t.tagName, t.heading, t.strong], color: palette.tag, fontWeight: "600" },
    { tag: [t.attributeName, t.annotation, t.meta, t.processingInstruction], color: palette.meta },
    { tag: [t.link, t.url], color: palette.keyword, textDecoration: "underline" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.invalid, color: palette.invalid },
  ]);
}

/**
 * Build the editor chrome theme for one layer.
 *
 * The surfaces are deliberately transparent: the pane around the editor owns the
 * background, so a mode switch does not produce two slightly different whites.
 *
 * @param resolved - Which theme layer to build
 * @returns A CodeMirror theme extension
 */
function buildChromeTheme(resolved: ResolvedTheme): Extension {
  const dark = resolved === "default-dark";

  return EditorView.theme(
    {
      "&": {
        backgroundColor: "transparent",
        color: "var(--foreground)",
        fontSize: "var(--text-base)",
      },
      ".cm-content": {
        caretColor: "var(--pencil-blue)",
        fontFamily: "var(--font-sans)",
        padding: "0",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-sans)",
        lineHeight: "1.7",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--pencil-blue)",
        borderLeftWidth: "2px",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "color-mix(in oklab, var(--pencil-blue) 20%, transparent)",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in oklab, var(--pencil-blue) 5%, transparent)",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        borderRight: "1px solid var(--rule)",
        color: "var(--muted-foreground)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-2xs)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "var(--pencil-blue)",
      },
      ".cm-foldPlaceholder": {
        backgroundColor: "var(--muted)",
        border: "none",
        color: "var(--muted-foreground)",
      },
      ".cm-selectionMatch": {
        backgroundColor: "color-mix(in oklab, var(--pencil-blue) 14%, transparent)",
      },
      ".cm-searchMatch": {
        backgroundColor: "color-mix(in oklab, var(--pencil-blue) 22%, transparent)",
        outline: "1px solid var(--pencil-blue)",
      },
      ".cm-tooltip": {
        backgroundColor: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        color: "var(--popover-foreground)",
      },
      ".cm-panels": {
        backgroundColor: "var(--card)",
        color: "var(--card-foreground)",
      },
    },
    { dark }
  );
}

/**
 * Override the editor face with the mono stack.
 *
 * Both this app's theme and Draftly's base theme put the prose serif on `.cm-content`,
 * which is right for the markdown surface and wrong wherever the text on screen *is*
 * source — Source mode and the two export panes.
 *
 * The selectors are written against `&.cm-editor` rather than bare `.cm-content` to buy a
 * class of specificity. Two `EditorView.theme()` extensions targeting the same selector
 * are resolved by the order their `StyleModule`s were created, not by extension order, so
 * winning on specificity is the only way to make this independent of import order.
 */
export const sourceFaceTheme: Extension = EditorView.theme({
  "&.cm-editor": { fontSize: "var(--text-xs)" },
  "&.cm-editor .cm-content": { fontFamily: "var(--font-mono)" },
  "&.cm-editor .cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65" },
});

const THEMES: Record<ResolvedTheme, Extension> = {
  "default-light": [buildChromeTheme("default-light"), syntaxHighlighting(buildHighlightStyle(LIGHT))],
  "default-dark": [buildChromeTheme("default-dark"), syntaxHighlighting(buildHighlightStyle(DARK))],
};

/**
 * The app's CodeMirror theme for a resolved theme layer.
 *
 * Both layers are built once at module scope. The same extension is handed to the editor,
 * to the source panes, and to `preview()` / `generateCSS()` as their `syntaxTheme` — which
 * is what keeps a fenced code block the same colour on both surfaces.
 *
 * @param resolved - The theme layer currently on screen
 * @returns The matching CodeMirror extension
 *
 * @example
 * ```tsx
 * <CodeMirror theme={codemirrorTheme(resolvedTheme)} />
 * ```
 */
export function codemirrorTheme(resolved: ResolvedTheme): Extension {
  return THEMES[resolved];
}

/**
 * Map a resolved theme to Draftly's theme enum value.
 *
 * Kept next to the CodeMirror theme because the two always change together: the editor's
 * decoration layer and its syntax colours have to agree on light or dark.
 *
 * `ThemeEnum.AUTO` is never returned. It applies the `default` layer only and does not
 * detect the system theme, so the app resolves the preference itself and asks for a
 * concrete layer.
 *
 * @param resolved - The theme layer currently on screen
 * @returns `ThemeEnum.DARK` or `ThemeEnum.LIGHT`
 */
export function draftlyTheme(resolved: ResolvedTheme): ThemeEnum {
  return resolved === "default-dark" ? ThemeEnum.DARK : ThemeEnum.LIGHT;
}
