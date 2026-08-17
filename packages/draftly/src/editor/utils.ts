import type { EditorView } from "@codemirror/view";
import type { StyleSpec } from "style-mod";

/**
 * Deep merge two objects
 * @param a - First object
 * @param b - Second object
 * @returns Merged object
 */
export function deepMerge<T>(a: T, b?: T): T {
  const result = { ...a };

  if (!b) {
    return result;
  }

  for (const key in b as T) {
    if (b[key] && typeof b[key] === "object" && !Array.isArray(b[key]) && typeof a[key] === "object") {
      result[key] = deepMerge(a[key], b[key]);
    } else {
      result[key] = b[key];
    }
  }

  return result;
}

/**
 * Theme style
 */
export type ThemeStyle = {
  [selector: string]: StyleSpec;
};

/**
 * Theme Enum
 */
export enum ThemeEnum {
  DARK = "dark",
  LIGHT = "light",
  AUTO = "auto",
}

/**
 * Function to create the themes
 *
 * @param defaultTheme - Default theme -- Always applied
 * @param darkTheme - Dark theme -- Applied when theme is "dark" or "auto" and system is dark
 * @param lightTheme - Light theme -- Applied when theme is "light" or "auto" and system is light
 * @returns Theme function
 */
export function createTheme({
  default: defaultTheme,
  dark: darkTheme,
  light: lightTheme,
}: {
  default: ThemeStyle;
  dark?: ThemeStyle;
  light?: ThemeStyle;
}): (theme: ThemeEnum) => ThemeStyle {
  return (theme: ThemeEnum) => {
    defaultTheme = flattenThemeStyles(defaultTheme);
    darkTheme = flattenThemeStyles(darkTheme || {});
    lightTheme = flattenThemeStyles(lightTheme || {});

    let style: ThemeStyle = defaultTheme;

    if (theme === ThemeEnum.DARK) {
      style = deepMerge(style, darkTheme);
    }

    if (theme === ThemeEnum.LIGHT) {
      style = deepMerge(style, lightTheme);
    }

    return style;
  };
}

export function flattenThemeStyles(themeStyles: ThemeStyle, parentSelector?: string): ThemeStyle {
  const flattened: ThemeStyle = {};

  for (const [selectors, styles] of Object.entries(themeStyles)) {
    for (const selector of selectors.split(",")) {
      if (typeof styles === "object" && !Array.isArray(styles)) {
        // Flatten nested styles
        const fullSelector = fixSelector(parentSelector ? `${parentSelector} ${selector}` : selector);
        const nestedStyles = flattenThemeStyles(styles as ThemeStyle, fullSelector);
        Object.assign(flattened, nestedStyles);
      } else {
        // Add styles to the flattened object
        if (parentSelector) {
          flattened[parentSelector] = { ...flattened[parentSelector], [selector]: styles };
        } else {
          flattened[selector] = styles as StyleSpec;
        }
      }
    }
  }

  return flattened;
}

export function fixSelector(selector: string): string {
  // Replace all occurrences of "&" with the parent selector
  return selector.replace(/\s&/g, "");
}

/**
 * Check if cursor is within the given range
 */
export function cursorInRange(view: EditorView, from: number, to: number): boolean {
  const selection = view.state.selection.main;
  return selection.from <= to && selection.to >= from;
}

/**
 * Check if any selection overlaps with the given range
 */
export function selectionOverlapsRange(view: EditorView, from: number, to: number): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.from <= to && range.to >= from) {
      return true;
    }
  }
  return false;
}

/**
 * Toggle markdown style on selection or insert markers at cursor
 * @param marker - The markdown marker (e.g., "**" for bold, "*" for italic)
 * @returns Command function for EditorView
 */
export function toggleMarkdownStyle(marker: string): (view: EditorView) => boolean {
  return (view: EditorView) => {
    const { state } = view;
    const { from, to, empty } = state.selection.main;

    // Get selected text
    const selectedText = state.sliceDoc(from, to);

    // Check if already wrapped with markers
    const markerLen = marker.length;
    const beforeFrom = Math.max(0, from - markerLen);
    const afterTo = Math.min(state.doc.length, to + markerLen);
    const textBefore = state.sliceDoc(beforeFrom, from);
    const textAfter = state.sliceDoc(to, afterTo);

    const isWrapped = textBefore === marker && textAfter === marker;

    if (isWrapped) {
      // Remove markers
      view.dispatch({
        changes: [
          { from: beforeFrom, to: from, insert: "" },
          { from: to, to: afterTo, insert: "" },
        ],
        selection: { anchor: beforeFrom, head: beforeFrom + selectedText.length },
      });
    } else if (empty) {
      // No selection - insert markers and place cursor between them
      view.dispatch({
        changes: { from, to, insert: marker + marker },
        selection: { anchor: from + markerLen },
      });
    } else {
      // Wrap selection with markers
      view.dispatch({
        changes: { from, to, insert: marker + selectedText + marker },
        selection: { anchor: from + markerLen, head: to + markerLen },
      });
    }

    return true;
  };
}
