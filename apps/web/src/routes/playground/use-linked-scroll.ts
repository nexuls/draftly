import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { type RefObject, useEffect } from "react";
import { buildScrollMapping, findHeadings, mapScrollOffset, type ScrollPair } from "@/lib/scroll-sync";

/**
 * How long after the last scroll event the driving side gives up its claim.
 *
 * Long enough to cover the gap between the events of one wheel or trackpad gesture, short
 * enough that releasing the wheel and immediately scrolling the other column is not
 * ignored. Momentum scrolling keeps firing events well past the gesture, which is the case
 * this number is really sized for.
 */
const GESTURE_IDLE_MS = 150;

/**
 * The first correction's delay, doubling with each pass that follows.
 *
 * The correction moves the follower, which makes the follower emit scroll events of its
 * own. Releasing the claim before those arrive would let them start a gesture in the
 * opposite direction and bounce the pair back.
 *
 * It doubles because the two things a pass waits for settle on very different timescales.
 * A layout caused by assigning `scrollTop` is done within a frame, but a Mermaid diagram or
 * a block of KaTeX is rendered asynchronously, and until it has been, the height CodeMirror
 * reports for the lines around it is the placeholder's. An early pass catches the first;
 * only a late one catches the second. Four passes reach roughly 1.2s in total, which covers
 * the asynchronous plugins without leaving a correction pending long enough to feel like
 * the page moving on its own.
 */
const CORRECTION_SETTLE_MS = 80;

/**
 * How many times the correction may re-measure before accepting where it landed.
 *
 * Correcting the follower is what causes it to render the lines around its new position,
 * which is what makes the next measurement of that position accurate — so the correction
 * is a fixed-point iteration, not a single adjustment. It converges in one pass almost
 * everywhere and in two around a tall block whose rendered height differs sharply between
 * the surfaces, such as a block of LaTeX. The bound is here so that content which cannot
 * settle degrades to a small residual error instead of looping.
 */
const MAX_CORRECTION_PASSES = 4;

/** Sub-pixel differences are not worth another measurement pass. */
const CORRECTION_EPSILON_PX = 1;

/** Every heading level the preview can emit, as a selector. */
const PREVIEW_HEADINGS = "h1, h2, h3, h4, h5, h6";

type UseLinkedScrollOptions = {
  /** The editor column's scroll container. */
  editorScrollRef: RefObject<HTMLDivElement | null>;
  /** The preview column's scroll container. */
  previewScrollRef: RefObject<HTMLDivElement | null>;
  /** Gives access to the live `EditorView` and its height map. */
  editorRef: RefObject<ReactCodeMirrorRef | null>;
  /** The markdown source, used to locate headings. */
  markdown: string;
  /** Only the split surface has two columns to link. */
  enabled: boolean;
};

/** The maximum `scrollTop` an element can hold. */
function maxScroll(element: HTMLElement): number {
  return Math.max(element.scrollHeight - element.clientHeight, 0);
}

/**
 * Convert a position in client coordinates into an offset within a scroller's content.
 *
 * @param clientTop - A `getBoundingClientRect().top`, or an equivalent client-space y
 * @param scroller - The scroll container to measure against
 * @returns The offset from the top of the scroller's content
 */
function toContentOffset(clientTop: number, scroller: HTMLElement): number {
  return clientTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

/**
 * Keep the editor and preview columns showing the same part of the document.
 *
 * The two columns are not the same height — the editor shows a table as pipes and an image
 * as a widget, the preview shows both rendered — so matching `scrollTop` or matching
 * percentages both drift. Headings are used as correspondence points instead: the nth
 * heading on one side is the nth heading on the other, and positions between them are
 * interpolated.
 *
 * **Anchors are measured at the start of each gesture, not once per document.** CodeMirror
 * estimates the height of lines it has not rendered, and those estimates are refined as
 * they scroll into view, so a mapping built once would slowly stop describing the editor it
 * was built from.
 *
 * The scroller being driven fires its own scroll events when its `scrollTop` is assigned,
 * which would drive the first one back; one side therefore claims the gesture and holds it
 * until the events stop.
 *
 * @param options - The two scrollers, the editor view, the source text, and the on switch
 */
export function useLinkedScroll({
  editorScrollRef,
  previewScrollRef,
  editorRef,
  markdown,
  enabled,
}: UseLinkedScrollOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const editorScroller = editorScrollRef.current;
    const previewScroller = previewScrollRef.current;
    if (!editorScroller || !previewScroller) return;

    /** Which scroller started the gesture in progress, or null between gestures. */
    let driver: HTMLElement | null = null;
    let releaseTimer: number | undefined;
    let mapping: { forward: ScrollPair[]; backward: ScrollPair[] } | null = null;
    /**
     * The pair of content heights the cached mapping was measured against.
     *
     * CodeMirror estimates the height of every line it has not drawn, and replaces each
     * estimate with a real measurement as the line scrolls into view — so the editor's
     * total height creeps as the reader travels, and a mapping measured at the start of a
     * long gesture is describing a column that no longer exists by the end of it. Comparing
     * the two scroll heights is two property reads, which is cheap enough to do on every
     * scroll event, and it re-measures exactly when the old numbers went stale.
     */
    let measuredAt = "";

    /**
     * Measure where each heading sits in each column.
     *
     * @returns A mapping in each direction, or null while either side is unmeasurable
     */
    function measure() {
      const view = editorRef.current?.view;
      if (!view || !editorScroller || !previewScroller) return null;

      const headings = findHeadings(markdown);
      const editorOffsets: number[] = [];

      for (const heading of headings) {
        if (heading.line > view.state.doc.lines) break;
        const from = view.state.doc.line(heading.line).from;
        // `documentTop` is the document's top edge in client space, and a block's `top` is
        // measured from there, so the sum is the heading's client-space position without
        // requiring the line to be rendered.
        editorOffsets.push(toContentOffset(view.documentTop + view.lineBlockAt(from).top, editorScroller));
      }

      const previewOffsets = [...previewScroller.querySelectorAll(PREVIEW_HEADINGS)].map((element) =>
        toContentOffset(element.getBoundingClientRect().top, previewScroller)
      );

      const editorMax = maxScroll(editorScroller);
      const previewMax = maxScroll(previewScroller);

      return {
        forward: buildScrollMapping(editorOffsets, previewOffsets, editorMax, previewMax),
        backward: buildScrollMapping(previewOffsets, editorOffsets, previewMax, editorMax),
      };
    }

    /**
     * Drive one scroller from the other.
     *
     * @param source - The scroller the reader is moving
     * @param target - The scroller to follow along
     * @param direction - Which of the two mappings applies
     */
    function sync(source: HTMLElement, target: HTMLElement, direction: "forward" | "backward") {
      if (driver !== null && driver !== source) return;
      driver = source;

      const heights = `${source.scrollHeight}x${target.scrollHeight}`;
      if (mapping === null || heights !== measuredAt) {
        mapping = measure();
        measuredAt = heights;
      }

      if (mapping) target.scrollTop = mapScrollOffset(source.scrollTop, mapping[direction]);

      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => correct(source, target, direction), GESTURE_IDLE_MS);
    }

    /**
     * Re-measure once the gesture has stopped, and align exactly.
     *
     * CodeMirror only knows the true height of the lines it has rendered; everything else
     * is estimated from an average, and the estimate is replaced with the real measurement
     * as a line scrolls into view. A gesture that jumps a long way — dragging the scrollbar,
     * or pressing End — therefore computes its anchors from heights that are superseded by
     * the time it arrives, which lands the follower up to a screen or so out. By the time
     * the gesture has gone quiet the destination is rendered and measured, so measuring
     * again resolves it.
     *
     * @param source - The scroller the gesture moved
     * @param target - The scroller following it
     * @param direction - Which of the two mappings applies
     */
    function correct(source: HTMLElement, target: HTMLElement, direction: "forward" | "backward", pass = 0) {
      const settled = measure();

      if (settled) {
        const next = mapScrollOffset(source.scrollTop, settled[direction]);

        if (Math.abs(next - target.scrollTop) > CORRECTION_EPSILON_PX) {
          target.scrollTop = next;

          // Moving the follower is what gets its new neighbourhood rendered and truly
          // measured, so the next pass has better numbers than this one did.
          if (pass < MAX_CORRECTION_PASSES) {
            releaseTimer = window.setTimeout(
              () => correct(source, target, direction, pass + 1),
              CORRECTION_SETTLE_MS * 2 ** pass
            );
            return;
          }
        }
      }

      // The claim is held a little longer so the correction's own scroll events are not
      // mistaken for the reader starting a gesture on the follower.
      releaseTimer = window.setTimeout(() => {
        driver = null;
        mapping = null;
        measuredAt = "";
      }, CORRECTION_SETTLE_MS);
    }

    const onEditorScroll = () => sync(editorScroller, previewScroller, "forward");
    const onPreviewScroll = () => sync(previewScroller, editorScroller, "backward");

    editorScroller.addEventListener("scroll", onEditorScroll, { passive: true });
    previewScroller.addEventListener("scroll", onPreviewScroll, { passive: true });

    return () => {
      window.clearTimeout(releaseTimer);
      editorScroller.removeEventListener("scroll", onEditorScroll);
      previewScroller.removeEventListener("scroll", onPreviewScroll);
    };
  }, [enabled, markdown, editorScrollRef, previewScrollRef, editorRef]);
}
