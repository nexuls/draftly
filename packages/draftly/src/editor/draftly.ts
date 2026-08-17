import { type Extension, Prec } from "@codemirror/state";
import { EditorView, highlightActiveLine, type KeyBinding, keymap } from "@codemirror/view";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownConfig } from "@lezer/markdown";
import type { DraftlyPlugin, PluginContext } from "./plugin";
import { createDraftlyViewExtension } from "./view-plugin";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentOnInput } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { ThemeEnum } from "./utils";
import { markdownResetExtension } from "./theme";

/**
 * DraftlyNode: represents a node in the markdown tree
 *
 * Useful for debugging and development
 */
export type DraftlyNode = {
  from: number;
  to: number;
  name: string;
  children: DraftlyNode[];
  isSelected: boolean;
};

/**
 * Configuration options for the draftly editor
 */
export interface DraftlyConfig {
  /** Theme */
  theme?: ThemeEnum;

  /** Weather to load base styles */
  baseStyles?: boolean;

  /** Plugins to load */
  plugins?: DraftlyPlugin[];

  /** Additional markdown extensions for the parser */
  markdown?: MarkdownConfig[];

  /** Additional CodeMirror extensions */
  extensions?: Extension[];

  /** Additional keybindings */
  keymap?: KeyBinding[];

  /** Disable the built-in view plugin (for raw markdown mode) */
  disableViewPlugin?: boolean;

  /** Enable default keybindings */
  defaultKeybindings?: boolean;

  /** Enable history */
  history?: boolean;

  /** Enable indent with tab */
  indentWithTab?: boolean;

  /** Highlight active line */
  highlightActiveLine?: boolean;

  /** Line wrapping in raw markdown mode */
  lineWrapping?: boolean;

  /** Callback to receive the nodes on every update */
  onNodesChange?: (nodes: DraftlyNode[]) => void;
}

/**
 * Creates a draftly editor extension bundle for CodeMirror 6
 *
 * @param config - Configuration options for the editor
 * @returns CodeMirror Extension that can be added to EditorState
 *
 * @example
 * ```ts
 * import { EditorView } from '@codemirror/view';
 * import { EditorState } from '@codemirror/state';
 * import { draftly } from 'draftly';
 *
 * const view = new EditorView({
 *   state: EditorState.create({
 *     doc: '# Hello draftly',
 *     extensions: [draftly()]
 *   }),
 *   parent: document.getElementById('editor')
 * });
 * ```
 */
export function draftly(config: DraftlyConfig = {}): Extension[] {
  const {
    theme: configTheme = ThemeEnum.AUTO,
    baseStyles = true,
    plugins = [],
    extensions = [],
    keymap: configKeymap = [],
    disableViewPlugin = false,
    defaultKeybindings = true,
    history: configHistory = true,
    indentWithTab: configIndentWithTab = true,
    highlightActiveLine: configHighlightActiveLine = true,
    lineWrapping: configLineWrapping = true,
    onNodesChange: configOnNodesChange = undefined,
  } = config;

  const allPlugins = [...plugins];

  // Collect all extensions from plugins
  const pluginExtensions: Extension[] = [];
  const pluginKeymaps: KeyBinding[] = [];
  const markdownExtensions: MarkdownConfig[] = [];

  // Create plugin context for lifecycle methods
  const pluginContext: PluginContext = { config };

  if (!disableViewPlugin) {
    // Process each plugin
    for (const plugin of allPlugins) {
      // Call onRegister lifecycle hook
      plugin.onRegister(pluginContext);

      // Collect extensions via class method
      const exts = plugin.getExtensions();
      if (exts.length > 0) {
        pluginExtensions.push(...exts);
      }

      // Collect keymaps via class method
      const keys = plugin.getKeymap();
      if (keys.length > 0) {
        pluginKeymaps.push(...keys);
      }

      // Collect theme via class method
      const theme = plugin.theme;
      if (baseStyles && theme && typeof theme === "function") {
        pluginExtensions.push(EditorView.theme(theme(configTheme)));
      }

      // Collect markdown parser extensions via class method
      const md = plugin.getMarkdownConfig();
      if (md) {
        markdownExtensions.push(md);
      }
    }
  }

  // Add config-level markdown extensions
  if (config.markdown) {
    markdownExtensions.push(...config.markdown);
  }

  // Build the base markdown language support
  const markdownSupport = markdown({
    base: markdownLanguage,
    codeLanguages: languages,
    extensions: markdownExtensions,
    addKeymap: true,
    completeHTMLTags: true,
    pasteURLAsLink: true,
  });

  // Core CodeMirror extensions (in order)
  const baseExtensions: Extension[] = [
    ...(defaultKeybindings ? [keymap.of(defaultKeymap)] : []),
    ...(configHistory ? [history(), keymap.of(historyKeymap)] : []),
    ...(configIndentWithTab ? [indentOnInput(), keymap.of([indentWithTab])] : []),
    ...(configHighlightActiveLine && disableViewPlugin ? [highlightActiveLine()] : []),
  ];

  // draftly extensions (pass plugins for decoration support)
  const draftlyExtensions: Extension[] = [];
  if (!disableViewPlugin) {
    draftlyExtensions.push(createDraftlyViewExtension(configTheme, baseStyles, allPlugins, configOnNodesChange));
    draftlyExtensions.push(Prec.highest(markdownResetExtension));
  }
  if (!disableViewPlugin || configLineWrapping) draftlyExtensions.push(EditorView.lineWrapping);

  // Compose all extensions together
  const composedExtensions: Extension[] = [
    // Core markdown support (highest priority)
    Prec.high(markdownSupport),
    Prec.high(keymap.of(markdownKeymap)),

    // draftly view plugin for rich rendering
    draftlyExtensions,

    // Core CodeMirror extensions
    baseExtensions,

    // Plugin extensions & keymaps
    pluginExtensions,
    pluginKeymaps.length > 0 ? keymap.of(pluginKeymaps) : [],

    // Config keymaps & extensions
    configKeymap.length > 0 ? keymap.of(configKeymap) : [],
    extensions,
  ];

  return composedExtensions;
}
