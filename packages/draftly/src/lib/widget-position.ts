import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";

/**
 * Resolving a widget's document range at event time.
 *
 * @packageDocumentation
 */

/**
 * A resolved document range.
 */
export interface WidgetRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Walk up from a node to the nearest ancestor with one of the given names.
 *
 * @param view - The EditorView, for the syntax tree
 * @param pos - Document position to resolve at
 * @param side - Which side of `pos` to resolve toward
 * @param nodeNames - Node names to accept
 * @returns The matching node's range, or `null`
 */
function resolveAt(view: EditorView, pos: number, side: -1 | 1, nodeNames: readonly string[]): WidgetRange | null {
  let node = syntaxTree(view.state).resolveInner(pos, side);

  while (node.parent) {
    if (nodeNames.includes(node.name)) {
      return { from: node.from, to: node.to };
    }
    node = node.parent;
  }

  return nodeNames.includes(node.name) ? { from: node.from, to: node.to } : null;
}

/**
 * Resolve the document range of the construct a widget belongs to, **at event time**.
 *
 * Widgets must not carry their `from`/`to` into `eq()` — positions shift on any edit
 * earlier in the document, so a position-comparing `eq` never reports equality and
 * CodeMirror rebuilds the widget on every keystroke. But the click handlers genuinely
 * need a range. This resolves one from the live DOM instead of a snapshot, which is also
 * more correct: a snapshot taken at build time is already stale after an edit above it.
 *
 * Both sides of the position are tried, because Draftly places widgets two ways — as a
 * `Decoration.replace` over the construct (position lands at its start) and as a
 * `Decoration.widget` with `side: 1` at the construct's end (position lands at its end).
 *
 * @param view - The EditorView the widget is mounted in
 * @param dom - The widget's own DOM element, as returned from `toDOM`
 * @param nodeNames - Node names that count as the enclosing construct
 * @returns The construct's current range, or `null` if it cannot be resolved
 *
 * @example
 * ```ts
 * const range = resolveWidgetRange(view, span, ["Link"]) ?? { from: this.from, to: this.to };
 * view.dispatch({ selection: { anchor: range.from, head: range.to } });
 * ```
 */
export function resolveWidgetRange(
  view: EditorView,
  dom: HTMLElement,
  nodeNames: readonly string[]
): WidgetRange | null {
  let pos: number;
  try {
    pos = view.posAtDOM(dom);
  } catch {
    // The element is no longer part of the view -- a click racing a teardown.
    return null;
  }

  return resolveAt(view, pos, -1, nodeNames) ?? resolveAt(view, pos, 1, nodeNames);
}

/**
 * Compare two flat string maps by content.
 *
 * `JSON.stringify` was the previous idiom for this in `MermaidBlockWidget`; it is
 * key-order dependent and allocates two strings on every comparison — in a function
 * whose whole job is to be cheap enough to run per keystroke.
 *
 * @param a - First map
 * @param b - Second map
 * @returns `true` if both have the same keys with the same values
 */
export function shallowEqualRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}
