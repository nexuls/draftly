import type { Decoration, EditorView, KeyBinding, ViewUpdate } from "@codemirror/view";
import type { Extension, Range } from "@codemirror/state";
import type { MarkdownConfig } from "@lezer/markdown";
import type { SyntaxNode } from "@lezer/common";
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
 * Decoration context passed to plugin decoration builders
 * Provides access to view state and decoration collection
 */
export interface DecorationContext {
  /** The EditorView instance (readonly) */
  readonly view: EditorView;

  /** Array to push decorations into (will be sorted automatically) */
  readonly decorations: Range<Decoration>[];

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

  /** Decoration priority (higher = applied later) */
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
   * @param node - The syntax node to render
   * @param children - Pre-rendered children HTML
   * @param ctx - Preview context with document and utilities
   * @returns HTML string to use, or null to use default rendering
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
