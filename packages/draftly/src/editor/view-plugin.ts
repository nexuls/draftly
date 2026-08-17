import { type Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { type Extension, Facet, type Range, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { cursorInRange, selectionOverlapsRange, ThemeEnum } from "./utils";
import { draftlyBaseTheme } from "./theme";
import type { DecorationContext, DraftlyPlugin } from "./plugin";
import type { DraftlyNode } from "./draftly";

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
 * Facet to register the theme
 */
export const draftlyThemeFacet = Facet.define<ThemeEnum, ThemeEnum>({
  combine: (values) => values.find((v) => v !== undefined) || ThemeEnum.AUTO,
});

/**
 * Build decorations for the visible viewport
 * @param view - The EditorView instance
 * @param plugins - Optional array of plugins to invoke for decorations
 */
function buildDecorations(view: EditorView, plugins: DraftlyPlugin[] = []): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const decorations: Range<Decoration>[] = [];

  // Allow plugins to contribute decorations
  if (plugins.length > 0) {
    const ctx: DecorationContext = {
      view,
      decorations,
      selectionOverlapsRange: (from, to) => selectionOverlapsRange(view, from, to),
      cursorInRange: (from, to) => cursorInRange(view, from, to),
    };

    // Sort plugins by priority and invoke each one's decoration builder
    const sortedPlugins = [...plugins].sort((a, b) => a.decorationPriority - b.decorationPriority);

    for (const plugin of sortedPlugins) {
      try {
        plugin.buildDecorations(ctx);
      } catch {
        // Silently ignore errors from partial tree states (e.g., Lezer TreeBuffer
        // "Invalid child in posBefore"). These resolve on the next update cycle.
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

  constructor(view: EditorView) {
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
 * @returns Extension array including view plugin, theme, and plugin facet
 */
export function createDraftlyViewExtension(
  theme: ThemeEnum = ThemeEnum.AUTO,
  baseStyles = true,
  plugins: DraftlyPlugin[] = [],
  onNodesChange?: (nodes: DraftlyNode[]) => void
): Extension[] {
  return [
    draftlyEditorClass,
    DraftlyPluginsFacet.of(plugins),
    draftlyOnNodesChangeFacet.of(onNodesChange),
    draftlyThemeFacet.of(theme),
    draftlyViewPlugin,
    ...(baseStyles ? [draftlyBaseTheme] : []),
  ];
}
