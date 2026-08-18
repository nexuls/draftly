import type { EditorView } from "@codemirror/view";
import type { StyleSpec } from "style-mod";

/**
 * Keys that must never be copied across during a merge. Assigning any of them
 * walks up the prototype chain instead of writing an own property, which is the
 * prototype-pollution shape. `deepMerge` is a generic exported utility, so the
 * guard lives here rather than at its (currently theme-only) call sites.
 */
const UNSAFE_MERGE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Deep merge two objects.
 *
 * **Never mutates either argument** — every level allocates a fresh object.
 * `createTheme` depends on this contract to stay pure, so it is part of the
 * function's API rather than an implementation detail.
 *
 * Inherited keys and the prototype-pollution keys are skipped.
 *
 * @param a - Base object; its values are the fallback
 * @param b - Overlay object; its values win where both define a key
 * @returns A new object; neither input is modified
 */
export function deepMerge<T>(a: T, b?: T): T {
  const result = { ...a };

  if (!b) {
    return result;
  }

  for (const key in b as T) {
    if (!Object.hasOwn(b as object, key) || UNSAFE_MERGE_KEYS.has(key)) {
      continue;
    }

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
  // Flatten once, at construction. The returned function is called per plugin per
  // `draftly()` call and again per `generateCSS()` call, so flattening inside it
  // repeated the whole tree walk every time -- and did so by reassigning the
  // closure parameters, which only stayed correct because `deepMerge` happens not
  // to mutate its first argument.
  const flatDefault = flattenThemeStyles(defaultTheme);
  const flatDark = flattenThemeStyles(darkTheme || {});
  const flatLight = flattenThemeStyles(lightTheme || {});

  return (theme: ThemeEnum) => {
    if (theme === ThemeEnum.DARK) {
      return deepMerge(flatDefault, flatDark);
    }

    if (theme === ThemeEnum.LIGHT) {
      return deepMerge(flatDefault, flatLight);
    }

    return flatDefault;
  };
}

/**
 * Flatten a nested theme tree into a flat `selector -> StyleSpec` map.
 *
 * Nested objects become descendant selectors and comma-separated keys are split
 * into one entry each, so `EditorView.theme()` and `generateCSS()` both receive
 * the single-level shape they expect.
 *
 * @param themeStyles - Theme tree, possibly nested and comma-separated
 * @param parentSelector - Accumulated ancestor selector during recursion
 * @returns A flat map with one entry per resolved selector
 */
export function flattenThemeStyles(themeStyles: ThemeStyle, parentSelector?: string): ThemeStyle {
  const flattened: ThemeStyle = {};

  for (const [selectors, styles] of Object.entries(themeStyles)) {
    // Trim after splitting: `".b, .c"` otherwise yields a key of `" .c"`, whose
    // leading space survives into the emitted selector.
    for (const selector of selectors.split(",").map((s) => s.trim())) {
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

/**
 * Collapse the nesting `&` into its parent selector.
 *
 * `flattenThemeStyles` always joins with a space before recursing, so a child
 * written as `&.active` arrives here as `.parent &.active` and the space plus
 * `&` are what have to go.
 *
 * @param selector - Joined selector, possibly containing ` &`
 * @returns The selector with the nesting marker removed
 */
export function fixSelector(selector: string): string {
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
