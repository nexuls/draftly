/**
 * One markdown document in the playground.
 *
 * Persisted as-is to `localStorage`; the shape is the storage format.
 */
export type PlaygroundDocument = {
  /** Stable identity. The two seeded documents use `"0"` and `"1"`. */
  id: string;
  /** Shown in the document list and the top rail. */
  title: string;
  /** The markdown source. */
  content: string;
};

/**
 * What the centre pane is showing.
 *
 * Named for what the reader is doing rather than for the library call behind it —
 * `"source"` disables the decoration layer, `"export"` runs `preview()` and
 * `generateCSS()`, and `"split"` is `"write"` and `"read"` at once.
 */
export type PlaygroundMode = "write" | "read" | "split" | "source" | "export";

/** Per-plugin on/off state, keyed by the plugin's lowercased `name`. */
export type PluginConfig = Record<string, boolean>;

/**
 * Everything the inspector can change at runtime.
 *
 * Mirrors the subset of `DraftlyConfig` and `PreviewConfig` that is interesting to toggle
 * live. Anything added here needs a control in the inspector, or it is dead state.
 */
export type PlaygroundConfig = {
  editor: {
    baseStyles: boolean;
    defaultKeybindings: boolean;
    history: boolean;
    indentWithTab: boolean;
    highlightActiveLine: boolean;
    lineWrapping: boolean;
  };
  preview: {
    includeBase: boolean;
    sanitize: boolean;
  };
  plugins: PluginConfig;
};

/** Whether the current document is written to `localStorage` yet. */
export type SaveStatus = "idle" | "saving" | "saved";
