import type { Decoration, EditorView, KeyBinding, ViewUpdate } from "@codemirror/view";
import type { Extension, Range } from "@codemirror/state";
import type { MarkdownConfig } from "@lezer/markdown";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import type { DraftlyConfig } from "./draftly";
import { createTheme, type ThemeEnum, type ThemeStyle } from "./utils";
import { resolvePluginTheme } from "./theme-cache";
import { StyleModule } from "style-mod";

/**
 * Shared no-op theme resolver for plugins that do not override `theme`.
 *
 * Module-level so the base-class getter returns a *stable* value. It previously
 * built a new `createTheme(...)` closure per access, which broke identity-based
 * memoization for every subclass that did not override the getter.
 */
const emptyThemeResolver = createTheme({
  default: {},
  dark: {},
  light: {},
});

/**
 * Context passed to plugin lifecycle methods
 */
export interface PluginContext {
  /** Current configuration */
  readonly config: DraftlyConfig;
}

/**
 * Plugin configuration schema
 */
export interface PluginConfig {
  [key: string]: unknown;
}

/**
 * Spec for {@link DecorationContext.iterateVisible}.
 *
 * Mirrors the subset of Lezer's `iterate` options a decoration builder needs; `from`
 * and `to` are supplied by the context, which is the entire point.
 */
export interface VisibleIterateSpec {
  /**
   * Called on entering a node. Return `false` to skip its subtree.
   */
  enter(node: SyntaxNodeRef): boolean | void;

  /**
   * Called on leaving a node whose `enter` did not return `false`.
   */
  leave?(node: SyntaxNodeRef): void;
}

/**
 * Decoration context passed to plugin decoration builders
 * Provides access to view state and decoration collection
 */
export interface DecorationContext {
  /** The EditorView instance (readonly) */
  readonly view: EditorView;

  /** Array to push decorations into (will be sorted automatically) */
  readonly decorations: Range<Decoration>[];

  /**
   * The document ranges CodeMirror has actually rendered.
   *
   * Falls back to the whole document when the view has not measured yet, so this is
   * never empty.
   */
  readonly visibleRanges: readonly { readonly from: number; readonly to: number }[];

  /**
   * Walk the syntax tree, **scoped to the viewport**.
   *
   * Use this instead of `syntaxTree(view.state).iterate(...)`. An unbounded walk makes
   * every update cost O(document) — including a plain cursor move, which rebuilds
   * decorations just like an edit does. With 14 plugins that was 14 full-document walks
   * per keystroke.
   *
   * Nodes that merely *overlap* a visible range are still entered, so a construct half
   * off-screen is decorated in full. When the viewport is split into several ranges,
   * a node spanning the gap is entered once, not once per range.
   *
   * @param spec - `enter`, and optionally `leave`
   */
  iterateVisible(spec: VisibleIterateSpec): void;

  /** Check if selection overlaps with a range (to show raw markdown) */
  selectionOverlapsRange(from: number, to: number): boolean;

  /** Check if cursor is within a range */
  cursorInRange(from: number, to: number): boolean;
}

/**
 * Abstract base class for all draftly plugins
 *
 * Implements OOP principles:
 * - Abstraction: abstract name/version must be implemented by subclasses
 * - Encapsulation: private _config, protected _context
 * - Inheritance: specialized plugin classes can extend this
 */
export abstract class DraftlyPlugin {
  /** Unique plugin identifier (abstract - must be implemented) */
  abstract readonly name: string;

  /** Plugin version (abstract - must be implemented) */
  abstract readonly version: string;

  /**
   * Priority of this plugin relative to others, on **both** surfaces.
   *
   * - **Editor:** plugins are sorted *ascending* and all of them run. Later decorations
   *   layer over earlier ones, so a higher number wins visually.
   * - **Preview:** candidates for a node are tried in *descending* order and the first
   *   non-null `renderToHTML` result wins. So a higher number wins here too.
   *
   * The sorts point opposite ways because the composition models differ — layering
   * versus precedence — and that is exactly what makes one number mean the same thing
   * on both surfaces. Two plugins claiming the same node at the same priority is
   * ambiguous and warns in development.
   *
   * Pick a value inside an existing band; see `artifacts/architecture/plugin-system.md`.
   */
  readonly decorationPriority: number = 100;

  /** Plugin dependencies - names of required plugins */
  readonly dependencies: string[] = [];

  /** Node types this plugin handles for decorations and preview rendering */
  readonly requiredNodes: readonly string[] = [];

  /** Private configuration storage */
  private _config: PluginConfig = {};

  /** Protected context - accessible to subclasses */
  protected _context: PluginContext | null = null;

  /** Get plugin configuration */
  get config(): PluginConfig {
    return this._config;
  }

  /** Set plugin configuration */
  set config(value: PluginConfig) {
    this._config = value;
  }

  /** Get plugin context */
  get context(): PluginContext | null {
    return this._context;
  }

  /**
   * Plugin theme resolver.
   *
   * Overrides must return a **module-level constant**, not a fresh `createTheme(...)`
   * per access — the resolved styles and the `EditorView.theme()` extension are both
   * memoized per `(plugin, ThemeEnum)` pair, and an unstable getter defeats that.
   */
  get theme(): (theme: ThemeEnum) => ThemeStyle {
    return emptyThemeResolver;
  }

  // ============================================
  // EXTENSION METHODS (overridable by subclasses)
  // ============================================

  /**
   * Return CodeMirror extensions for this plugin
   * Override to provide custom extensions
   */
  getExtensions(): Extension[] {
    return [];
  }

  /**
   * Return markdown parser extensions
   * Override to extend markdown parsing
   */
  getMarkdownConfig(): MarkdownConfig | null {
    return null;
  }

  /**
   * Return keybindings for this plugin
   * Override to add custom keyboard shortcuts
   */
  getKeymap(): KeyBinding[] {
    return [];
  }

  // ============================================
  // DECORATION METHODS (overridable by subclasses)
  // ============================================

  /**
   * Build decorations for the current view state
   * Override to contribute decorations to the editor
   *
   * @param ctx - Decoration context with view and decoration array
   */
  buildDecorations(_ctx: DecorationContext): void {
    // Default implementation does nothing
    // Subclasses override to add decorations
  }

  // ============================================
  // LIFECYCLE HOOKS (overridable by subclasses)
  // ============================================

  /**
   * Called when plugin is registered with draftly
   * Override to perform initialization
   *
   * @param context - Plugin context with configuration
   */
  onRegister(context: PluginContext): void | Promise<void> {
    this._context = context;
  }

  /**
   * Called when plugin is unregistered
   * Override to perform cleanup
   */
  onUnregister(): void {
    this._context = null;
  }

  /**
   * Called when EditorView is created and ready
   * Override to perform view-specific initialization
   *
   * @param view - The EditorView instance
   */
  onViewReady(_view: EditorView): void {
    // Default implementation does nothing
  }

  /**
   * Called on view updates (document changes, selection changes, etc.)
   * Override to react to editor changes
   *
   * @param update - The ViewUpdate with change information
   */
  onViewUpdate(_update: ViewUpdate): void {
    // Default implementation does nothing
  }

  // ============================================
  // PROTECTED UTILITIES (for subclasses)
  // ============================================

  /**
   * Helper to get current editor state
   * @param view - The EditorView instance
   */
  protected getState(view: EditorView) {
    return view.state;
  }

  /**
   * Helper to get current document
   * @param view - The EditorView instance
   */
  protected getDocument(view: EditorView) {
    return view.state.doc;
  }

  // ============================================
  // PREVIEW RENDERING METHODS (for draftly/preview)
  // ============================================

  /**
   * Render a syntax node to HTML for preview mode
   * Override to provide custom HTML rendering for specific node types
   *
   * Returning `null` **declines**: the next candidate plugin for this node is tried,
   * then the default renderer, then the escaped leaf fallback. Returning `""` is not the
   * same thing — it renders the node as nothing, which is how syntax markers are dropped
   * from static output.
   *
   * @param node - The syntax node to render
   * @param children - Pre-rendered children HTML
   * @param ctx - Preview context with document and utilities
   * @returns HTML to use, `""` to render nothing, or `null` to decline
   */
  renderToHTML?(
    node: SyntaxNode,
    children: string,
    ctx: {
      sliceDoc(from: number, to: number): string;
      sanitize(html: string): string;
      syntaxHighlighters?: readonly import("@lezer/highlight").Highlighter[];
    }
  ): string | null | Promise<string | null>;

  /**
   * Get CSS styles for preview mode
   * Override to provide custom CSS for preview rendering
   *
   * @param theme - Current theme enum
   * @returns CSS string for preview styles
   */
  getPreviewStyles(theme: ThemeEnum, wrapperClass: string): string {
    return this.transformToCss(resolvePluginTheme(this, theme), wrapperClass);
  }

  /**
   * Transform ThemeStyle object to CSS string for preview
   * Uses cssClassMap to convert CM selectors to semantic selectors
   */
  protected transformToCss(themeStyles: ThemeStyle, wrapperClass: string): string {
    const styleMod = new StyleModule(themeStyles, {
      finish: (sel) => {
        return `.${wrapperClass} ${sel}`;
      },
    });
    return styleMod.getRules();
  }
}

/**
 * Base class for plugins that primarily contribute decorations
 * Extends DraftlyPlugin with decoration-focused defaults
 */
export abstract class DecorationPlugin extends DraftlyPlugin {
  /**
   * Decoration priority - lower than default for decoration plugins
   * Override to customize
   */
  override decorationPriority = 50;

  /**
   * Subclasses must implement this to provide decorations
   * @param ctx - Decoration context
   */
  abstract override buildDecorations(ctx: DecorationContext): void;
}

/**
 * Base class for plugins that add syntax/parser extensions
 * Extends DraftlyPlugin with syntax-focused requirements
 */
export abstract class SyntaxPlugin extends DraftlyPlugin {
  /**
   * Subclasses must implement this to provide markdown config
   */
  abstract override getMarkdownConfig(): MarkdownConfig;
}
