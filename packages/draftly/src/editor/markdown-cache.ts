import type { MarkdownConfig } from "@lezer/markdown";
import type { DraftlyPlugin } from "./plugin";

/**
 * Memo of `plugin.getMarkdownConfig()`.
 *
 * The method returns a fresh object literal on every call in every plugin that
 * implements it, so the result has no stable identity of its own. That is fine for
 * `draftly()`, which runs once — but the preview renderer builds a parser per render
 * and cannot cache it without a stable extension set to key on.
 *
 * `null` is a valid, cached result: most plugins do not extend the parser, and
 * re-deriving that is still an allocation.
 */
const markdownConfigCache = new WeakMap<DraftlyPlugin, MarkdownConfig | null>();

/**
 * Resolve a plugin's markdown parser extension, memoized per instance.
 *
 * A plugin's parser extension is a property of the plugin, not of the call — none of the
 * built-ins vary it by argument, and there is no argument to vary it by.
 *
 * @param plugin - The plugin to ask
 * @returns Its `MarkdownConfig`, or `null` if it does not extend the parser. **Shared —
 *   do not mutate.**
 */
export function resolveMarkdownConfig(plugin: DraftlyPlugin): MarkdownConfig | null {
  let config = markdownConfigCache.get(plugin);

  if (config === undefined) {
    config = plugin.getMarkdownConfig();
    markdownConfigCache.set(plugin, config);
  }

  return config;
}
