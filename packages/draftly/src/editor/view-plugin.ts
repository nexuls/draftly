import { type Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { type Extension, Facet, type Range, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { cursorInRange, selectionOverlapsRange, ThemeEnum } from "./utils";
import { draftlyBaseTheme } from "./theme";
import type { DecorationContext, DraftlyPlugin } from "./plugin";
import type { DraftlyNode } from "./draftly";
import { isDevMode, reportOnce } from "../lib/dev";

/**
 * Facet to register plugins with the view plugin
 */
export const DraftlyPluginsFacet = Facet.define<DraftlyPlugin[], DraftlyPlugin[]>({
  combine: (values) => values.flat(),
});

/**
 * Facet to register the onNodesChange callback
 */
export const draftlyOnNodesChangeFacet = Facet.define<
  ((nodes: DraftlyNode[]) => void) | undefined,
  ((nodes: DraftlyNode[]) => void) | undefined
>({
  combine: (values) => values.find((v) => v !== undefined),
});

/**
 * Facet to register the plugin-error handler
 */
export const draftlyOnPluginErrorFacet = Facet.define<
  ((plugin: string, error: unknown) => void) | undefined,
  ((plugin: string, error: unknown) => void) | undefined
>({
  combine: (values) => values.find((v) => v !== undefined),
});

/**
 * Facet to register the theme
 */
export const draftlyThemeFacet = Facet.define<ThemeEnum, ThemeEnum>({
  combine: (values) => values.find((v) => v !== undefined) || ThemeEnum.AUTO,
});

/**
 * Resolve the ranges a decoration walk should cover.
 *
 * `view.visibleRanges` is empty before the view has measured — during construction, and
 * for a view that is not in the document yet. Falling back to the whole document there
 * keeps the first paint correct; the next update narrows it.
 *
 * @param view - The EditorView instance
 * @returns Non-empty, ascending, disjoint ranges
 */
function resolveVisibleRanges(view: EditorView): readonly { readonly from: number; readonly to: number }[] {
  const ranges = view.visibleRanges;
  return ranges.length > 0 ? ranges : [{ from: 0, to: view.state.doc.length }];
}

/**
 * Build the viewport-scoped tree walker handed to every plugin.
 *
 * The walk is bounded so a plugin's cost is O(viewport) rather than O(document). Lezer
 * yields nodes that *overlap* the bounds, so a construct straddling the viewport edge is
 * still entered and decorated in full.
 *
 * When the viewport is split into several ranges, a node spanning the gap would be
 * entered once per range and its decorations pushed twice. The `seen` set collapses
 * that; returning `false` on a repeat also skips the subtree, whose nodes were seen for
 * the same reason. The set is only allocated when there is more than one range, which is
 * the uncommon case.
 *
 * @param view - The EditorView instance
 * @param ranges - Ranges from {@link resolveVisibleRanges}
 * @returns The `iterateVisible` implementation for the context
 */
function createVisibleIterator(
  view: EditorView,
  ranges: readonly { readonly from: number; readonly to: number }[]
): DecorationContext["iterateVisible"] {
  return (spec) => {
    const tree = syntaxTree(view.state);

    // `exactOptionalPropertyTypes` is on, so `leave` cannot be passed as possibly
    // undefined -- give Lezer a no-op instead of an absent key.
    const leave = spec.leave ?? (() => {});

    const first = ranges[0];
    if (ranges.length === 1 && first) {
      tree.iterate({ from: first.from, to: first.to, enter: spec.enter, leave });
      return;
    }

    const seen = new Set<string>();
    for (const { from, to } of ranges) {
      tree.iterate({
        from,
        to,
        enter: (node) => {
          const key = `${node.from}:${node.to}:${node.name}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return spec.enter(node);
        },
        leave,
      });
    }
  };
}

/**
 * Build decorations for the visible viewport
 * @param view - The EditorView instance
 * @param plugins - Optional array of plugins to invoke for decorations
 */
/**
 * Decide whether a `buildDecorations` failure is worth telling anyone about.
 *
 * Swallowing these errors is deliberate: Lezer hands out partially-built trees while a
 * parse is in progress and node access throws until it settles, and letting that
 * propagate would break the editor for a transient, expected state. The cost is that a
 * genuine plugin bug — a typo, a null dereference, a bad range — produces exactly the
 * same symptom, silently.
 *
 * The discriminator is whether the tree is actually finished for the rendered range,
 * rather than matching Lezer's error messages. Message text is not a stable contract
 * across versions; parse completeness is.
 *
 * @param view - The EditorView being decorated
 * @returns `true` if the error is a genuine bug rather than parse transience
 */
function isReportableDecorationError(view: EditorView): boolean {
  return syntaxTreeAvailable(view.state, view.viewport.to);
}

/**
 * Report a plugin's decoration failure, once per distinct plugin and message.
 *
 * @param view - The view being decorated
 * @param plugin - The plugin that threw
 * @param error - The thrown value
 */
function reportDecorationError(view: EditorView, plugin: DraftlyPlugin, error: unknown): void {
  if (!isReportableDecorationError(view)) return;

  const handler = view.state.facet(draftlyOnPluginErrorFacet);
  if (!handler && !isDevMode()) return;

  const message = error instanceof Error ? error.message : String(error);
  reportOnce(`${plugin.name}\u0000${message}`, () => {
    if (handler) {
      handler(plugin.name, error);
    } else {
      console.error(`[draftly] Plugin "${plugin.name}" threw while building decorations:`, error);
    }
  });
}

function buildDecorations(view: EditorView, plugins: DraftlyPlugin[] = []): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const decorations: Range<Decoration>[] = [];

  // Allow plugins to contribute decorations
  if (plugins.length > 0) {
    const visibleRanges = resolveVisibleRanges(view);
    const ctx: DecorationContext = {
      view,
      decorations,
      visibleRanges,
      iterateVisible: createVisibleIterator(view, visibleRanges),
      selectionOverlapsRange: (from, to) => selectionOverlapsRange(view, from, to),
      cursorInRange: (from, to) => cursorInRange(view, from, to),
    };

    // Sort plugins by priority and invoke each one's decoration builder
    const sortedPlugins = [...plugins].sort((a, b) => a.decorationPriority - b.decorationPriority);

    for (const plugin of sortedPlugins) {
      try {
        plugin.buildDecorations(ctx);
      } catch (error) {
        // Still swallowed -- a transient partial tree must not break the editor. But it
        // is no longer silent when the tree is complete and the error is therefore real.
        reportDecorationError(view, plugin, error);
      }
    }
  }

  // Sort decorations by position (required for RangeSetBuilder)
  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);

  // Build the decoration set
  for (const decoration of decorations) {
    builder.add(decoration.from, decoration.to, decoration.value);
  }

  return builder.finish();
}

/**
 * draftly View Plugin
 * Handles rich markdown rendering with decorations
 */
class draftlyViewPluginClass {
  decorations: DecorationSet;
  private plugins: DraftlyPlugin[];
  private onNodesChange: ((nodes: DraftlyNode[]) => void) | undefined;

  /**
   * Held solely so `destroy()` can name the view it is tearing down. `destroy()` takes
   * no arguments, and `onViewDestroy` needs the identity to release the right state.
   */
  private readonly view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.plugins = view.state.facet(DraftlyPluginsFacet);
    this.onNodesChange = view.state.facet(draftlyOnNodesChangeFacet);
    this.decorations = buildDecorations(view, this.plugins);

    // Notify plugins that view is ready
    for (const plugin of this.plugins) {
      plugin.onViewReady(view);
    }

    // Call onNodesChange callback with initial nodes
    if (this.onNodesChange && typeof this.onNodesChange === "function") {
      this.onNodesChange(this.buildNodes(view));
    }
  }

  update(update: ViewUpdate) {
    // Update plugins list if facet changed
    this.plugins = update.view.state.facet(DraftlyPluginsFacet);
    this.onNodesChange = update.view.state.facet(draftlyOnNodesChangeFacet);

    // Notify plugins of the update
    for (const plugin of this.plugins) {
      plugin.onViewUpdate(update);
    }

    // Rebuild decorations when:
    // - Document changes
    // - Selection changes (to show/hide syntax markers)
    // - Viewport changes
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = buildDecorations(update.view, this.plugins);

      // Call onNodesChange callback
      if (this.onNodesChange) {
        this.onNodesChange(this.buildNodes(update.view));
      }
    }
  }

  /**
   * Called by CodeMirror when the view is torn down.
   *
   * The library had no teardown path at all before this: no view-plugin `destroy()`, no
   * widget `destroy()`, and `onUnregister` declared but never called. Since plugin
   * instances are module-level singletons, anything a plugin was holding — a pending
   * microtask's `EditorView`, most concretely — was retained for the lifetime of the
   * page. Hosts that rebuild their extension array on a config change (the playground
   * does, on every devbar toggle) create and destroy views routinely.
   *
   * Reads the plugin list from the facet rather than `this.plugins` so a plugin removed
   * by a reconfigure just before teardown is not notified about a view it never saw.
   */
  destroy(): void {
    for (const plugin of this.plugins) {
      try {
        plugin.onViewDestroy(this.view);
      } catch {
        // A throwing teardown in one plugin must not prevent the others from cleaning
        // up -- that would turn a minor bug into the leak this method exists to fix.
      }
    }
  }

  private buildNodes(view: EditorView): DraftlyNode[] {
    const tree = syntaxTree(view.state);
    const roots: DraftlyNode[] = [];
    const stack: DraftlyNode[] = [];

    tree.iterate({
      enter: (nodeRef) => {
        const node: DraftlyNode = {
          from: nodeRef.from,
          to: nodeRef.to,
          name: nodeRef.name,
          children: [],
          isSelected: selectionOverlapsRange(view, nodeRef.from, nodeRef.to),
        };

        if (stack.length > 0) {
          stack[stack.length - 1]!.children.push(node);
        } else {
          roots.push(node);
        }

        stack.push(node);
      },
      leave: () => {
        stack.pop();
      },
    });

    return roots;
  }
}

/**
 * The main draftly ViewPlugin extension
 */
export const draftlyViewPlugin = ViewPlugin.fromClass(draftlyViewPluginClass, {
  decorations: (v) => v.decorations,
  provide: () => [],
});

/**
 * Extension to add the cm-draftly-enabled class to the editor
 */
const draftlyEditorClass = EditorView.editorAttributes.of({ class: "cm-draftly" });

/**
 * Create draftly view extension bundle with plugin support
 * @param plugins - Optional array of DraftlyPlugin instances
 * @param onNodesChange - Optional callback to receive nodes on every update
 * @param onPluginError - Optional handler for plugin decoration failures
 * @returns Extension array including view plugin, theme, and plugin facet
 */
export function createDraftlyViewExtension(
  theme: ThemeEnum = ThemeEnum.AUTO,
  baseStyles = true,
  plugins: DraftlyPlugin[] = [],
  onNodesChange?: (nodes: DraftlyNode[]) => void,
  onPluginError?: (plugin: string, error: unknown) => void
): Extension[] {
  return [
    draftlyEditorClass,
    DraftlyPluginsFacet.of(plugins),
    draftlyOnNodesChangeFacet.of(onNodesChange),
    draftlyOnPluginErrorFacet.of(onPluginError),
    draftlyThemeFacet.of(theme),
    draftlyViewPlugin,
    ...(baseStyles ? [draftlyBaseTheme] : []),
  ];
}
