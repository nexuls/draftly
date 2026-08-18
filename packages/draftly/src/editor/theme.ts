import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createTheme, type ThemeEnum, type ThemeStyle } from "./utils";

/**
 * Semantic design tokens, light values.
 *
 * Every colour a plugin draws with resolves through one of these. That buys two
 * things the previous arrangement could not: a host can restyle draftly by
 * redefining a dozen custom properties instead of overriding dozens of
 * selectors, and dark mode stops being a second full copy of every colour rule —
 * only the tokens are restated in {@link darkTokens}.
 *
 * Each token also accepts a host-supplied variable, so dropping draftly into a
 * design system that already publishes `--color-primary` and friends themes it
 * with no configuration, while a bare page still renders with the literal
 * fallback.
 */
const lightTokens: Record<string, string> = {
  // Typography
  "--draftly-font-sans": "var(--font-sans, sans-serif)",
  "--draftly-font-mono": "var(--font-jetbrains-mono, monospace)",

  // Text
  "--draftly-color-text": "var(--color-foreground, #0f172a)",
  "--draftly-color-muted": "var(--color-muted-foreground, #6a737d)",
  "--draftly-color-link": "var(--color-primary, #0366d6)",
  "--draftly-color-link-hover": "#0056b3",
  "--draftly-color-success": "#22863a",
  "--draftly-color-danger": "var(--color-destructive, #d73a49)",

  // Containers
  "--draftly-color-border": "var(--color-border, #d7dee7)",
  "--draftly-color-surface": "var(--color-background, #ffffff)",
  "--draftly-color-surface-raised": "var(--color-background, #ffffff)",
  "--draftly-surface-code": "rgba(0, 0, 0, 0.03)",
  "--draftly-surface-code-inline": "rgba(0, 0, 0, 0.05)",
  "--draftly-surface-code-header": "rgba(0, 0, 0, 0.06)",
  "--draftly-surface-code-caption": "rgba(0, 0, 0, 0.06)",
  "--draftly-surface-header": "rgba(15, 23, 42, 0.04)",
  "--draftly-surface-stripe": "rgba(15, 23, 42, 0.02)",
  "--draftly-surface-hover": "rgba(15, 23, 42, 0.05)",
  "--draftly-color-tooltip-bg": "#24292e",
  "--draftly-color-tooltip-fg": "#ffffff",
  "--draftly-shadow-popover": "0 10px 24px rgba(15, 23, 42, 0.12)",

  // Generic foreground-on-background tints, for chrome that has no more
  // specific surface role. Most components do — see the `--draftly-surface-*`
  // tokens — because their light and dark values are not symmetric.
  "--draftly-tint-1": "rgba(0, 0, 0, 0.02)",
  "--draftly-tint-2": "rgba(0, 0, 0, 0.03)",
  "--draftly-tint-5": "rgba(0, 0, 0, 0.1)",

  // Diff and highlight accents. `-line` values are the translucent row washes,
  // `-text` the legible foreground on top of them.
  "--draftly-color-add": "#22c55e",
  "--draftly-color-add-text": "#16a34a",
  "--draftly-color-add-line": "rgba(34, 197, 94, 0.12)",
  "--draftly-color-add-word": "rgba(34, 197, 94, 0.25)",
  "--draftly-color-del": "#ef4444",
  "--draftly-color-del-text": "#dc2626",
  "--draftly-color-del-line": "rgba(239, 68, 68, 0.12)",
  "--draftly-color-del-word": "rgba(239, 68, 68, 0.25)",
  "--draftly-color-mark": "#f0b429",
  "--draftly-color-mark-line": "rgba(255, 220, 100, 0.2)",
  "--draftly-color-mark-word": "rgba(255, 220, 100, 0.4)",
  "--draftly-color-error-surface": "rgba(255, 0, 0, 0.1)",
};

/**
 * Dark overrides. Only tokens whose value actually changes appear here — a token
 * absent from this map deliberately holds across both themes.
 */
const darkTokens: Record<string, string> = {
  "--draftly-color-text": "var(--color-foreground, #e6edf3)",
  "--draftly-color-muted": "var(--color-muted-foreground, #8b949e)",
  "--draftly-color-link": "var(--color-primary, #58a6ff)",
  "--draftly-color-link-hover": "#79c0ff",
  "--draftly-color-success": "#7ee787",
  "--draftly-color-danger": "var(--color-destructive, #f85149)",

  "--draftly-color-border": "var(--color-border, #30363d)",
  "--draftly-color-surface": "var(--color-background, #0d1117)",
  "--draftly-color-surface-raised": "var(--color-background, #161b22)",
  "--draftly-surface-code": "rgba(255, 255, 255, 0.05)",
  "--draftly-surface-code-inline": "rgba(255, 255, 255, 0.1)",
  "--draftly-surface-code-header": "rgba(255, 255, 255, 0.08)",
  "--draftly-surface-code-caption": "rgba(255, 255, 255, 0.05)",
  "--draftly-surface-header": "rgba(255, 255, 255, 0.05)",
  "--draftly-surface-stripe": "rgba(255, 255, 255, 0.025)",
  "--draftly-surface-hover": "rgba(255, 255, 255, 0.08)",
  "--draftly-color-tooltip-bg": "#30363d",
  "--draftly-color-tooltip-fg": "#c9d1d9",
  "--draftly-shadow-popover": "0 12px 28px rgba(0, 0, 0, 0.35)",

  "--draftly-tint-1": "rgba(255, 255, 255, 0.02)",
  "--draftly-tint-2": "rgba(255, 255, 255, 0.03)",
  "--draftly-tint-5": "rgba(255, 255, 255, 0.1)",

  "--draftly-color-add-text": "#4ade80",
  "--draftly-color-add-line": "rgba(34, 197, 94, 0.15)",
  "--draftly-color-add-word": "rgba(34, 197, 94, 0.3)",
  "--draftly-color-del-text": "#f87171",
  "--draftly-color-del-line": "rgba(239, 68, 68, 0.15)",
  "--draftly-color-del-word": "rgba(239, 68, 68, 0.3)",
  "--draftly-color-mark": "#d9a520",
  "--draftly-color-mark-line": "rgba(255, 220, 100, 0.15)",
  "--draftly-color-mark-word": "rgba(255, 220, 100, 0.3)",
  "--draftly-color-error-surface": "rgba(255, 0, 0, 0.15)",
};

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
const sharedStyles: ThemeStyle = {
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
    fontFamily: "var(--draftly-font-sans)",
    fontSize: "16px",
    lineHeight: "1.6",
  },
};

/**
 * Styles that only make sense in the editor, because they address CodeMirror's
 * own DOM. Kept out of {@link sharedStyles} so the preview does not inherit dead
 * rules for elements it never renders.
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
 * Resolve the surface-agnostic base styles, including the token block, for a theme.
 *
 * Exported so `generateCSS()` can emit the same tokens the editor uses; without
 * them every `var(--draftly-*)` in a plugin's preview CSS falls back to nothing.
 *
 * @param theme - Which theme layer to apply
 * @returns Flattened base styles with tokens declared on the surface root
 */
export const resolveBaseStyles: (theme: ThemeEnum) => ThemeStyle = createTheme({
  default: { ...sharedStyles, "&.cm-draftly": { ...sharedStyles["&.cm-draftly"], ...lightTokens } },
  dark: { "&.cm-draftly": darkTokens },
});

/**
 * Resolve the editor's full base theme, tokens included.
 *
 * @param theme - Which theme layer to apply
 * @returns Base styles plus the editor-only rules
 */
export function resolveEditorBaseStyles(theme: ThemeEnum): ThemeStyle {
  return { ...resolveBaseStyles(theme), ...editorOnlyStyles };
}

/**
 * Memo of the base theme extension, one entry per {@link ThemeEnum} value.
 *
 * Same reasoning as `theme-cache.ts`: `EditorView.theme()` mints a fresh
 * `StyleModule`, and style-mod deduplicates injected rules by module identity, so
 * a new one per `draftly()` call appends another copy of every rule to the head.
 */
const baseThemeCache = new Map<ThemeEnum, Extension>();

/**
 * Base theme for draftly styling
 * Note: Layout styles are scoped under .cm-draftly which is added by the view plugin
 *
 * @param theme - Which theme layer to apply
 * @returns A CodeMirror theme extension; the same instance for the same theme
 */
export function draftlyBaseTheme(theme: ThemeEnum): Extension {
  let extension = baseThemeCache.get(theme);
  if (!extension) {
    extension = EditorView.theme(resolveEditorBaseStyles(theme));
    baseThemeCache.set(theme, extension);
  }
  return extension;
}

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
