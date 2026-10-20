/**
 * One heading, as a correspondence point between the editor and the preview.
 *
 * `line` is 1-based to match CodeMirror's `Text.line()`.
 */
export type HeadingAnchor = {
  /** 1-based document line the heading starts on. */
  line: number;
  /** Nesting level, 1-6. Carried for debugging; the mapping only uses order. */
  level: number;
};

/** Matches an ATX heading: one to six hashes, then a space or end of line. */
const ATX_HEADING = /^ {0,3}(#{1,6})(?:\s|$)/;

/** Matches a fence opening or closing a code block: three or more backticks or tildes. */
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Find every ATX heading in a markdown document.
 *
 * Deliberately a plain text scan rather than a syntax-tree walk. Reading the tree would
 * mean a runtime import of `@codemirror/language` into the app, and a second copy of a
 * CodeMirror package resolving alongside the library's own breaks facet identity — the one
 * failure mode this repo keeps its CodeMirror dependencies external to avoid. Headings are
 * the one construct simple enough to recognise without a parser, provided fenced blocks are
 * tracked so a `#` comment inside one is not mistaken for a heading.
 *
 * **Setext headings (`===` / `---` underlines) are not recognised.** They are rare, and the
 * consequence is contained: the preview reports one more heading than the editor, the counts
 * disagree, and {@link buildScrollMapping} falls back to proportional scrolling rather than
 * mapping the wrong pairs onto each other.
 *
 * @param markdown - The document source
 * @returns Every heading found, in document order
 *
 * @example
 * ```ts
 * findHeadings("# Title\n\n```\n# not a heading\n```\n\n## Next");
 * // [{ line: 1, level: 1 }, { line: 7, level: 2 }]
 * ```
 */
export function findHeadings(markdown: string): HeadingAnchor[] {
  const headings: HeadingAnchor[] = [];
  let fence: string | null = null;

  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index] ?? "";
    const fenceDelimiter = CODE_FENCE.exec(text)?.[1];

    if (fence !== null) {
      // Only a fence of the same character and at least the same length closes the block.
      const closes =
        fenceDelimiter !== undefined &&
        fenceDelimiter.charAt(0) === fence.charAt(0) &&
        fenceDelimiter.length >= fence.length;
      if (closes) fence = null;
      continue;
    }

    if (fenceDelimiter !== undefined) {
      fence = fenceDelimiter;
      continue;
    }

    const hashes = ATX_HEADING.exec(text)?.[1];
    if (hashes !== undefined) headings.push({ line: index + 1, level: hashes.length });
  }

  return headings;
}

/**
 * A pair of scroll positions known to show the same place in the document.
 */
export type ScrollPair = {
  /** Offset within the source scroller, in pixels from the top of its content. */
  from: number;
  /** The offset within the target scroller showing the same content. */
  to: number;
};

/**
 * Build the correspondence used to translate one scroller's position into the other's.
 *
 * Takes the raw anchor offsets measured on each side and reduces them to a list that is
 * safe to interpolate across: pairs that no scroll position could ever reach are dropped,
 * and so is any pair that would make the mapping run backwards. Both ends are pinned —
 * `(0, 0)` so the tops meet, and `(fromMax, toMax)` so the bottoms do — which is also what
 * makes a document with no headings degrade to plain proportional scrolling rather than to
 * no scrolling at all.
 *
 * Anchor counts that disagree mean the two sides are not describing the same headings, so
 * the whole anchor list is discarded in favour of the two sentinels.
 *
 * @param fromOffsets - Anchor offsets in the source scroller, in document order
 * @param toOffsets - Anchor offsets in the target scroller, in the same order
 * @param fromMax - The source's maximum `scrollTop`
 * @param toMax - The target's maximum `scrollTop`
 * @returns Strictly increasing pairs, always at least the two sentinels
 */
export function buildScrollMapping(
  fromOffsets: readonly number[],
  toOffsets: readonly number[],
  fromMax: number,
  toMax: number
): ScrollPair[] {
  const pairs: ScrollPair[] = [{ from: 0, to: 0 }];

  if (fromOffsets.length === toOffsets.length) {
    for (let index = 0; index < fromOffsets.length; index++) {
      const from = fromOffsets[index] ?? 0;
      const to = toOffsets[index] ?? 0;
      const previous = pairs[pairs.length - 1] ?? { from: 0, to: 0 };

      // A heading close to the bottom cannot be scrolled to the top of the viewport, so it
      // is not a position either side can actually hold. Interpolating towards it would
      // bend the whole last segment.
      if (from >= fromMax || to >= toMax) break;

      // Measurement noise and CodeMirror's estimated heights for unrendered lines can put
      // two anchors out of order; a non-increasing pair would invert the mapping.
      if (from <= previous.from || to <= previous.to) continue;

      pairs.push({ from, to });
    }
  }

  pairs.push({ from: Math.max(fromMax, 0), to: Math.max(toMax, 0) });
  return pairs;
}

/**
 * Translate a scroll position through a mapping, interpolating between anchors.
 *
 * Piecewise linear: within a segment the two sides advance in proportion, so the heading
 * that starts the segment stays aligned and the drift between headings is bounded by how
 * differently that one stretch renders. This is what proportional scrolling cannot do — in
 * the playground the two columns differ in total height by about a third, because the
 * editor shows a table as pipes while the preview shows it as a table.
 *
 * @param offset - The source scroller's current `scrollTop`
 * @param mapping - Output of {@link buildScrollMapping}
 * @returns The target's `scrollTop`, clamped to the mapping's range
 *
 * @example
 * ```ts
 * const mapping = buildScrollMapping([100], [200], 1000, 2000);
 * mapScrollOffset(50, mapping);  // 100 — halfway to the first heading on both sides
 * mapScrollOffset(100, mapping); // 200 — the heading itself
 * ```
 */
export function mapScrollOffset(offset: number, mapping: readonly ScrollPair[]): number {
  const first = mapping[0];
  const last = mapping[mapping.length - 1];
  if (first === undefined || last === undefined) return offset;
  if (offset <= first.from) return first.to;
  if (offset >= last.from) return last.to;

  for (let index = 0; index < mapping.length - 1; index++) {
    const start = mapping[index];
    const end = mapping[index + 1];
    if (start === undefined || end === undefined) break;
    if (offset > end.from) continue;

    const span = end.from - start.from;
    if (span <= 0) return end.to;

    const progress = (offset - start.from) / span;
    return start.to + progress * (end.to - start.to);
  }

  return last.to;
}
