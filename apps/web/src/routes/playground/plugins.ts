import type { DraftlyPlugin } from "draftly/src";
import { createAllPlugins } from "draftly/src/plugins/all";
import type { PlaygroundConfig, PluginConfig } from "./types";

/**
 * The playground's own plugin instances.
 *
 * Built once at module scope because the playground renders exactly one Draftly editor at
 * a time. A page with two editors calls `createAllPlugins()` once per editor instead —
 * plugin instances hold per-view state, so sharing one set across editors makes them
 * overwrite each other's configuration.
 *
 * This is the one consumer that genuinely wants `draftly/plugins/all`: it is a demo of
 * every feature, so it accepts pulling Mermaid and KaTeX. A real app imports
 * `draftly/plugins` and adds only the heavy ones it needs.
 */
export const playgroundPlugins: DraftlyPlugin[] = createAllPlugins();

/**
 * The inspector's plugin list, derived from the plugin set rather than written out.
 *
 * A plugin newly registered in `createEssentialPlugins()` therefore appears in the
 * inspector automatically. If a toggle is missing, the plugin was never added to the
 * factory — do not add a manual entry here.
 */
export const pluginToggleKeys: readonly string[] = playgroundPlugins.map((plugin) => plugin.name.toLowerCase());

const defaultPluginConfig: PluginConfig = Object.fromEntries(pluginToggleKeys.map((key) => [key, true]));

/**
 * The configuration the playground opens with: every flag and every plugin on.
 *
 * Starting from "everything on" means a toggle always demonstrates a feature being taken
 * away, which is the comparison that is actually useful.
 */
export const defaultPlaygroundConfig: PlaygroundConfig = {
  editor: {
    baseStyles: true,
    defaultKeybindings: true,
    history: true,
    indentWithTab: true,
    highlightActiveLine: true,
    lineWrapping: true,
  },
  preview: {
    includeBase: true,
    sanitize: true,
  },
  plugins: defaultPluginConfig,
};

/**
 * Filter the plugin set down to the ones currently enabled.
 *
 * @param config - The per-plugin toggle map
 * @returns The enabled plugin instances, in registration order
 */
export function selectActivePlugins(config: PluginConfig): DraftlyPlugin[] {
  return playgroundPlugins.filter((plugin) => config[plugin.name.toLowerCase()] ?? true);
}
