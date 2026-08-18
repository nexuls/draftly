/**
 * Monospace display width of a string, measured in terminal-style columns.
 *
 * Pure, dependency-free and CodeMirror-free. `String.length` counts UTF-16 code units,
 * which is the wrong measure for anything the user is likely to put in a table cell: a
 * CJK glyph occupies two columns and counts as one, an emoji counts as two and occupies
 * two, a combining accent counts as one and occupies none, and a ZWJ family emoji counts
 * as seven and occupies two.
 *
 * @packageDocumentation
 */

/**
 * Code point ranges that render two columns wide.
 *
 * Derived from Unicode's East Asian Width property — the `W` (Wide) and `F` (Fullwidth)
 * classes — plus the emoji blocks that render wide in practice. Kept as an inline table
 * rather than taking a dependency: `string-width` and friends pull in several transitive
 * packages to do what fits in a screen of ranges, and bundle size is a design constraint
 * here.
 *
 * Sorted ascending and non-overlapping, so {@link inRanges} can binary search.
 */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], // Hangul Jamo initial consonants
  [0x2e80, 0x303e], // CJK Radicals, Kangxi, CJK Symbols and Punctuation
  [0x3041, 0x33ff], // Hiragana, Katakana, Bopomofo, Hangul Compatibility Jamo, CJK Compatibility
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi Syllables, Yi Radicals
  [0xa960, 0xa97f], // Hangul Jamo Extended-A
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe10, 0xfe19], // Vertical Forms
  [0xfe30, 0xfe6f], // CJK Compatibility Forms, Small Form Variants
  [0xff00, 0xff60], // Fullwidth Forms
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x1f300, 0x1f64f], // Miscellaneous Symbols and Pictographs, Emoticons
  [0x1f900, 0x1f9ff], // Supplemental Symbols and Pictographs
  [0x1fa70, 0x1faff], // Symbols and Pictographs Extended-A
  [0x20000, 0x2fffd], // CJK Extension B and beyond
  [0x30000, 0x3fffd], // CJK Extension G and beyond
];

/**
 * Code point ranges that render zero columns wide.
 *
 * Combining marks attach to the preceding glyph, and the format characters (ZWJ, ZWNJ,
 * variation selectors) are invisible by construction.
 */
const ZERO_WIDTH_RANGES: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f], // Combining Diacritical Marks
  [0x0483, 0x0489], // Cyrillic combining marks
  [0x0591, 0x05bd], // Hebrew points
  [0x0610, 0x061a], // Arabic marks
  [0x064b, 0x065f], // Arabic diacritics
  [0x0e31, 0x0e31], // Thai vowel sign
  [0x0e34, 0x0e3a], // Thai vowel signs
  [0x1ab0, 0x1aff], // Combining Diacritical Marks Extended
  [0x1dc0, 0x1dff], // Combining Diacritical Marks Supplement
  [0x200b, 0x200f], // Zero-width space through RTL mark (includes ZWNJ, ZWJ)
  [0x20d0, 0x20f0], // Combining Diacritical Marks for Symbols
  [0xfe00, 0xfe0f], // Variation Selectors
  [0xfe20, 0xfe2f], // Combining Half Marks
  [0xfeff, 0xfeff], // Zero-width no-break space
  [0xe0100, 0xe01ef], // Variation Selectors Supplement
];

/**
 * Binary search a sorted, non-overlapping range table.
 *
 * @param code - Code point to test
 * @param ranges - Ascending, non-overlapping `[start, end]` pairs
 * @returns `true` if `code` falls inside any range
 */
function inRanges(code: number, ranges: readonly (readonly [number, number])[]): boolean {
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid] as readonly [number, number];

    if (code < range[0]) high = mid - 1;
    else if (code > range[1]) low = mid + 1;
    else return true;
  }

  return false;
}

/**
 * Lazily-created grapheme segmenter.
 *
 * `Intl.Segmenter` is the only correct way to group a ZWJ sequence or a base-plus-mark
 * pair into one cluster. It is absent in older browsers, hence the feature detection and
 * the code-point fallback in {@link displayWidth}. Constructing one is not free, so it is
 * built once and reused.
 */
let segmenter: Intl.Segmenter | null | undefined;

/**
 * Get the shared grapheme segmenter, or `null` where `Intl.Segmenter` is unavailable.
 *
 * @returns The segmenter, or `null`
 */
function getSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl !== "undefined" && "Segmenter" in Intl
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  }
  return segmenter;
}

/**
 * Width of a single grapheme cluster, in columns.
 *
 * The cluster's width is its **first** code point's width. Everything after the first is
 * a combining mark, a variation selector or a ZWJ-joined continuation — all of which
 * render inside the same cell rather than beside it.
 *
 * @param cluster - One grapheme cluster
 * @returns 0, 1 or 2
 */
function clusterWidth(cluster: string): number {
  const code = cluster.codePointAt(0);
  if (code === undefined) return 0;

  if (inRanges(code, ZERO_WIDTH_RANGES)) return 0;
  return inRanges(code, WIDE_RANGES) ? 2 : 1;
}

/**
 * Measure the monospace display width of a string, in columns.
 *
 * Pure ASCII returns exactly `text.length`, so existing documents see no padding churn.
 *
 * Where `Intl.Segmenter` is unavailable the function falls back to iterating code points,
 * which still handles CJK, emoji and combining marks correctly and only misgroups ZWJ
 * sequences — degrading to a slight over-estimate rather than to `String.length`.
 *
 * @param text - The string to measure
 * @returns Width in monospace columns
 *
 * @example
 * ```ts
 * displayWidth("abc");   // 3
 * displayWidth("日本語"); // 6
 * displayWidth("é"); // 1 -- 'e' plus a combining acute
 * ```
 */
export function displayWidth(text: string): number {
  let width = 0;

  const segments = getSegmenter();
  if (segments) {
    for (const { segment } of segments.segment(text)) {
      width += clusterWidth(segment);
    }
    return width;
  }

  for (const char of text) {
    width += clusterWidth(char);
  }
  return width;
}
