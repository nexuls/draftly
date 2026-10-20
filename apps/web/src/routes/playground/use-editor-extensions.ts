import type { Extension } from "@codemirror/state";
import { draftly, type DraftlyNode, type DraftlyPlugin, type ThemeEnum } from "draftly/src";
import { useMemo } from "react";
import { sourceFaceTheme } from "@/lib/codemirror-theme";
import type { PlaygroundConfig, PlaygroundMode } from "./types";

type UseEditorExtensionsOptions = {
  mode: PlaygroundMode;
  theme: ThemeEnum;
  plugins: DraftlyPlugin[];
  editorConfig: PlaygroundConfig["editor"];
  /** Whether the inspector is showing the syntax tree. */
  nodesVisible: boolean;
  onNodesChange: (nodes: DraftlyNode[]) => void;
};

/**
 * Compose the Draftly extension bundle for the current configuration.
 *
 * `theme` is resolved to a concrete layer by the caller rather than passed as
 * `ThemeEnum.AUTO`, which applies the default layer only and does not read the system
 * preference.
 *
 * In `"source"` mode the view plugin is disabled instead of the plugin list being emptied:
 * that leaves the parser and the keymaps in place and removes only the decoration layer,
 * which is exactly what "show me the markdown" should mean.
 *
 * @param options - Mode, theme, the active plugins, and the editor flags
 * @returns The memoized extension list
 */
export function useEditorExtensions({
  mode,
  theme,
  plugins,
  editorConfig,
  nodesVisible,
  onNodesChange,
}: UseEditorExtensionsOptions): Extension[] {
  return useMemo(() => {
    const bundle = draftly({
      theme,
      baseStyles: editorConfig.baseStyles,
      plugins,
      markdown: [],
      extensions: [],
      keymap: [],
      disableViewPlugin: mode === "source",
      defaultKeybindings: editorConfig.defaultKeybindings,
      history: editorConfig.history,
      indentWithTab: editorConfig.indentWithTab,
      highlightActiveLine: editorConfig.highlightActiveLine,
      lineWrapping: editorConfig.lineWrapping,
      // `onNodesChange` builds the whole tree on every update, so it is wired up only
      // while the inspector is actually showing it.
      onNodesChange: nodesVisible ? onNodesChange : undefined,
    });

    // Source mode is showing text that *is* source, so it takes the mono face. Appended
    // rather than merged into the theme so it wins the cascade.
    return mode === "source" ? [...bundle, sourceFaceTheme] : bundle;
  }, [mode, theme, plugins, editorConfig, nodesVisible, onNodesChange]);
}
