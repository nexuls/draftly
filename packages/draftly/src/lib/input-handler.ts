import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Mapping of typed input characters to surrounding markers.
 *
 * Example:
 * { "*": "*", "=": "==" }
 */
export type WrapSelectionMarkerMap = Record<string, string>;

/**
 * Creates an input handler that wraps non-empty selections with markdown markers
 * when a mapped character is typed.
 */
export function createWrapSelectionInputHandler(markersByInput: WrapSelectionMarkerMap): Extension {
  return EditorView.inputHandler.of((view, _from, _to, text) => {
    const marker = markersByInput[text];
    if (!marker) {
      return false;
    }

    const ranges = view.state.selection.ranges;
    if (ranges.length === 0 || ranges.some((range) => range.empty)) {
      return false;
    }

    const changes = ranges
      .map((range) => ({
        from: range.from,
        to: range.to,
        insert: `${marker}${view.state.sliceDoc(range.from, range.to)}${marker}`,
      }))
      .reverse();

    const nextRanges = ranges.map((range) =>
      EditorSelection.range(range.from + marker.length, range.to + marker.length)
    );

    view.dispatch({
      changes,
      selection: EditorSelection.create(nextRanges, view.state.selection.mainIndex),
    });

    return true;
  });
}
